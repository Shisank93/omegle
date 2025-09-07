import { useState, useEffect, useRef } from 'react';
import { db, auth, signIn } from '../services/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  deleteDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';

const useChatService = () => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [waitingDocRef, setWaitingDocRef] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const listenersRef = useRef([]);

  // 1. Sign in the user anonymously on hook initialization
  useEffect(() => {
    const authenticate = async () => {
      try {
        setStatus('Authenticating...');
        const currentUser = await signIn();
        setUser(currentUser);
        setStatus('Ready to chat. Please fill out the form.');
      } catch (err) {
        console.error(err);
        setError('Authentication failed. Please try again later.');
        setStatus('Error');
      }
    };
    authenticate();
  }, []);

  const startSearching = async (newUserInfo) => {
    if (!user) {
      setError('User not authenticated.');
      return;
    }
    // Store user info in state
    setUserInfo(newUserInfo);

    setStatus('Searching for a partner...');
    const waitingPoolRef = collection(db, 'waitingPool');

    // Create a document for the current user in the waiting pool
    const myInfo = {
      userId: user.uid,
      userInfo: newUserInfo,
      createdAt: serverTimestamp(),
    };
    const myDocRef = await addDoc(waitingPoolRef, myInfo);
    setWaitingDocRef(myDocRef);

    // --- Query for a partner with gender filtering ---
    let partnerQuery;
    if (newUserInfo.genderPreference === 'any') {
      // Find anyone who is looking for me or for anyone
      partnerQuery = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        where('userInfo.genderPreference', 'in', ['any', newUserInfo.gender]),
        limit(1)
      );
    } else {
      // Find someone of my preferred gender who is looking for me or for anyone
      partnerQuery = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        where('userInfo.gender', '==', newUserInfo.genderPreference),
        where('userInfo.genderPreference', 'in', ['any', newUserInfo.gender]),
        limit(1)
      );
    }

    const querySnapshot = await getDocs(partnerQuery);

    if (querySnapshot.empty && newUserInfo.genderPreference !== 'any') {
        // If no specific match, broaden the search to any gender if user is open to it.
        // This part can be expanded, but for now, we will just proceed to the waiting logic.
        setStatus(`No ${newUserInfo.genderPreference} is available right now. Waiting...`);
    }

    if (!querySnapshot.empty) {
      // --- Partner found ---
      const partnerDoc = querySnapshot.docs[0];
      const partnerData = partnerDoc.data();

      // Create a chat room
      const newRoomRef = doc(collection(db, 'chatRooms'));
      await setDoc(newRoomRef, {
        members: [user.uid, partnerData.userId],
        createdAt: serverTimestamp(),
      });

      // Create an invitation for the partner
      await setDoc(doc(db, 'invitations', partnerData.userId), {
        roomId: newRoomRef.id,
        from: user.uid,
      });

      // Set the chat room ID in the state
      setChatRoomId(newRoomRef.id);
      setStatus(`Matched with ${partnerData.userInfo.name}!`);

      // Clean up waiting pool
      await deleteDoc(myDocRef);
      await deleteDoc(partnerDoc.ref);

    } else {
      // --- No partner found, so we wait for an invitation ---
      setStatus('No one is available yet. Waiting for a partner...');

      const invitationRef = doc(db, 'invitations', user.uid);
      const unsubscribe = onSnapshot(invitationRef, async (doc) => {
        if (doc.exists()) {
          const invitation = doc.data();
          setChatRoomId(invitation.roomId);
          setStatus('You have been matched!');

          // Clean up the invitation
          await deleteDoc(invitationRef);

          // Stop listening
          unsubscribe();
        }
      });

      // We also need to clean up our own waiting document if we cancel
      // This will be handled in the `leaveChat` function.
    }
  };

  // Listen for messages and room events
  useEffect(() => {
    if (!chatRoomId || !user) return;

    // --- Listener for messages ---
    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const messagesUnsubscribe = onSnapshot(q, (querySnapshot) => {
      const newMessages = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        sender: doc.data().senderId === user.uid ? 'You' : 'Stranger',
      }));
      setMessages(newMessages);
    });

    // --- Listener for room deletion (partner disconnect) ---
    const roomRef = doc(db, 'chatRooms', chatRoomId);
    const roomUnsubscribe = onSnapshot(roomRef, (doc) => {
        if (!doc.exists()) {
            setStatus('Partner has disconnected. Searching for a new one...');
            leaveChat(false); // don't delete room again
            if (userInfo) {
                startSearching(userInfo); // Re-use user info to find new chat
            }
        }
    });

    listenersRef.current = [messagesUnsubscribe, roomUnsubscribe];

    return () => {
      listenersRef.current.forEach(unsubscribe => unsubscribe());
    };
  }, [chatRoomId, user]);

  const sendMessage = async (text) => {
    if (!chatRoomId || !user) return;

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    await addDoc(messagesRef, {
      text,
      senderId: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  const leaveChat = async (shouldDeleteRoom = true) => {
    listenersRef.current.forEach(unsubscribe => unsubscribe());
    listenersRef.current = [];

    if (shouldDeleteRoom && chatRoomId) {
      const roomRef = doc(db, 'chatRooms', chatRoomId);
      await deleteDoc(roomRef);
    }

    // Clean up waiting doc if it exists
    if (waitingDocRef) {
        await deleteDoc(waitingDocRef);
        setWaitingDocRef(null);
    }

    setChatRoomId(null);
    setMessages([]);
    setStatus('Chat ended. Find a new partner?');
  };

  return { user, status, error, chatRoomId, messages, startSearching, leaveChat, sendMessage };
};

export default useChatService;
