import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  getDocs,
  addDoc,
  doc,
  serverTimestamp,
  deleteDoc,
  setDoc,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';

const useChatService = () => {
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [waitingDocRef, setWaitingDocRef] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const listenersRef = useRef([]);

  // 1. Sign in the user anonymously on hook initialization
  useEffect(() => {
    const signIn = async () => {
      try {
        setStatus('Authenticating...');
        const currentUser = await signIn();
        setUser(currentUser);

        // Fetch blocked users
        const blockedUsersRef = collection(db, 'users', currentUser.uid, 'blocked');
        const snapshot = await getDocs(blockedUsersRef);
        const blockedIds = snapshot.docs.map(doc => doc.id);
        setBlockedUsers(blockedIds);

        setStatus('Ready to chat. Please fill out the form.');
      } catch (err) {
        console.error(err);
        setError('Failed to sign in.');
        setStatus('Error');
      }
    };
    signIn();
  }, []);

  const startSearching = async (newUserInfo) => {
    if (!user) {
      setError('User not authenticated.');
      return;
    }

    const interests = newUserInfo.interests ? newUserInfo.interests.split(',').map(i => i.trim().toLowerCase()).filter(i => i) : [];
    const userInfoWithInterests = { ...newUserInfo, interests };
    setUserInfo(userInfoWithInterests);

    setStatus('Searching for a partner...');
    const waitingPoolRef = collection(db, 'waitingPool');

    const myInfo = {
      userId: user.uid,
      userInfo: userInfoWithInterests,
      createdAt: serverTimestamp(),
    };
    const myDocRef = await addDoc(waitingPoolRef, myInfo);
    setWaitingDocRef(myDocRef);

    let querySnapshot;
    let partnerDoc;

    const findPartner = async (q) => {
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return snapshot.docs.find(doc => !blockedUsers.includes(doc.data().userId));
    };

    // --- Query Waterfall ---

    // 1. Strict query: common interests + gender preference
    if (interests.length > 0 && newUserInfo.genderPreference !== 'any') {
      const q = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        where('userInfo.interests', 'array-contains-any', interests),
        where('userInfo.gender', '==', newUserInfo.genderPreference),
        where('userInfo.genderPreference', 'in', ['any', newUserInfo.gender]),
        limit(10)
      );
      partnerDoc = await findPartner(q);
    }

    // 2. Relaxed query: common interests, any gender
    if (!partnerDoc && interests.length > 0) {
      const q = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        where('userInfo.interests', 'array-contains-any', interests),
        limit(10)
      );
      partnerDoc = await findPartner(q);
    }

    // 3. Relaxed query: gender preference, any interest
    if (!partnerDoc && newUserInfo.genderPreference !== 'any') {
      const q = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        where('userInfo.gender', '==', newUserInfo.genderPreference),
        where('userInfo.genderPreference', 'in', ['any', newUserInfo.gender]),
        limit(10)
      );
      partnerDoc = await findPartner(q);
    }

    // 4. Most relaxed query: any user
    if (!partnerDoc) {
      const q = query(
        waitingPoolRef,
        where('userId', '!=', user.uid),
        limit(10)
      );
      partnerDoc = await findPartner(q);
    }

    if (partnerDoc) {
      // --- Partner found ---
      const partnerData = partnerDoc.data();
      setPartnerId(partnerData.userId);

      // Create a chat room
      const newRoomRef = doc(collection(db, 'chatRooms'));
      await setDoc(newRoomRef, {
        users: [user.uid, partnerData.userId],
        createdAt: serverTimestamp(),
      });
      setChatRoomId(newRoomRef.id);
      setStatus('You are connected to a partner.');

      // Send an invitation to the partner
      const invitationRef = doc(db, 'invitations', partnerData.userId);
      await setDoc(invitationRef, {
        roomId: newRoomRef.id,
        from: user.uid,
      });

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
          if (blockedUsers.includes(invitation.from)) {
            // This user is blocked, ignore the invitation
            await deleteDoc(invitationRef);
            return;
          }
          setPartnerId(invitation.from);
          setChatRoomId(invitation.roomId);
          setStatus('You have been matched!');

          // Delete the invitation now that we've accepted it
          await deleteDoc(invitationRef);
          // Stop listening for invitations
          unsubscribe();
        }
      });
    }
  };

  const sendMessage = async (text) => {
    if (!chatRoomId || !user) return;
    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    await addDoc(messagesRef, {
      text,
      sender: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  useEffect(() => {
    if (!chatRoomId) return;

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        sender: doc.data().sender === user.uid ? 'You' : 'Stranger',
      }));
      setMessages(newMessages);
    });

    listenersRef.current.push(unsubscribe);

    // Cleanup listener on unmount
    return () => {
      listenersRef.current.forEach((unsub) => unsub());
      listenersRef.current = [];
    };
  }, [chatRoomId, user]);

  const leaveChat = async () => {
    listenersRef.current.forEach((unsub) => unsub());
    listeners- [ ]
- [ ] Ref.current = [];

    if (waitingDocRef) {
      await deleteDoc(waitingDocRef);
      setWaitingDocRef(null);
    }

    setChatRoomId(null);
    setMessages([]);
    setPartnerId(null);
    setStatus('Chat ended. Find a new partner?');
  };

  const reportUser = async () => {
    if (!user || !partnerId) return;

    const reportsRef = collection(db, 'reports');
    await addDoc(reportsRef, {
        reportedUserId: partnerId,
        reporterId: user.uid,
        timestamp: serverTimestamp(),
        chatRoomId: chatRoomId,
    });
  };

  const blockUser = async () => {
    if (!user || !partnerId) return;

    const blockRef = doc(db, 'users', user.uid, 'blocked', partnerId);
    await setDoc(blockRef, {
        timestamp: serverTimestamp(),
    });
    setBlockedUsers([...blockedUsers, partnerId]);
  };

  return { user, status, error, chatRoomId, messages, startSearching, leaveChat, sendMessage, reportUser, blockUser };
};

export default useChatService;
