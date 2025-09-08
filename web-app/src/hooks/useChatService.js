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
  orderBy,
  updateDoc,
} from 'firebase/firestore';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const useChatService = () => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [waitingDocRef, setWaitingDocRef] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [isCaller, setIsCaller] = useState(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pc = useRef(new RTCPeerConnection(servers));
  const listenersRef = useRef([]);

  // 1. Sign in the user anonymously
  useEffect(() => {
    const authenticate = async () => {
      try {
        setStatus('Authenticating...');
        const currentUser = await signIn();
        setUser(currentUser);
        const blockedUsersRef = collection(db, 'users', currentUser.uid, 'blocked');
        const snapshot = await getDocs(blockedUsersRef);
        setBlockedUsers(snapshot.docs.map(doc => doc.id));
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

    const isVideoAllowed = newUserInfo.isVideo && newUserInfo.age >= 18;

    if (isVideoAllowed) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            stream.getTracks().forEach((track) => {
                pc.current.addTrack(track, stream);
            });
        } catch (err) {
            setError('Could not access camera/mic. Please allow access and try again.');
            setStatus('Error');
            return;
        }
    }

    const interests = newUserInfo.interests ? newUserInfo.interests.split(',').map(i => i.trim().toLowerCase()).filter(i => i) : [];
    const userInfoWithInterests = { ...newUserInfo, interests, isVideo: isVideoAllowed };
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

    const findPartner = async (q) => {
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return snapshot.docs.find(doc => !blockedUsers.includes(doc.data().userId));
    };

    let partnerDoc;
    // ... (Query Waterfall - this logic is complex and can be simplified for now)
    const q = query(waitingPoolRef, where('userId', '!=', user.uid), limit(10));
    partnerDoc = await findPartner(q);

    if (partnerDoc) {
      const partnerData = partnerDoc.data();
      setPartnerId(partnerData.userId);
      setIsCaller(true);

      const newRoomRef = doc(collection(db, 'chatRooms'));
      await setDoc(newRoomRef, {
        members: [user.uid, partnerData.userId],
        createdAt: serverTimestamp(),
        isVideo: newUserInfo.isVideo || partnerData.userInfo.isVideo,
      });

      await setDoc(doc(db, 'invitations', partnerData.userId), {
        roomId: newRoomRef.id,
        from: user.uid,
      });

      setChatRoomId(newRoomRef.id);
      setStatus(`Matched with ${partnerData.userInfo.name}!`);

      await deleteDoc(myDocRef);
      await deleteDoc(partnerDoc.ref);
    } else {
      setStatus('No one is available yet. Waiting for a partner...');
      const invitationRef = doc(db, 'invitations', user.uid);
      const unsub = onSnapshot(invitationRef, async (doc) => {
        if (doc.exists()) {
          const invitation = doc.data();
          if (blockedUsers.includes(invitation.from)) {
            await deleteDoc(invitationRef);
            return;
          }
          setPartnerId(invitation.from);
          setIsCaller(false);
          setChatRoomId(invitation.roomId);
          setStatus('You have been matched!');
          await deleteDoc(invitationRef);
          unsub();
        }
      });
      listenersRef.current.push(unsub);
    }
  };

  // Listen for WebRTC signaling and messages
  useEffect(() => {
    if (!chatRoomId || !user) return;

    const roomRef = doc(db, 'chatRooms', chatRoomId);
    const offerCandidatesRef = collection(roomRef, 'offerCandidates');
    const answerCandidatesRef = collection(roomRef, 'answerCandidates');

    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(isCaller ? offerCandidatesRef : answerCandidatesRef, event.candidate.toJSON());
      }
    };

    pc.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    const roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        setStatus('Partner has disconnected. Searching for a new one...');
        leaveChat(false);
        if (userInfo) startSearching(userInfo);
        return;
      }

      if (isCaller && !pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        await pc.current.setRemoteDescription(answerDescription);
      }

      if (!isCaller && !pc.current.currentRemoteDescription && data?.offer) {
        const offerDescription = new RTCSessionDescription(data.offer);
        await pc.current.setRemoteDescription(offerDescription);
        const answerDescription = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answerDescription);
        await updateDoc(roomRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });
      }
    });

    const candidatesUnsubscribe = onSnapshot(isCaller ? answerCandidatesRef : offerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });

    // Create offer if caller
    if (isCaller && userInfo.isVideo) {
      const createOffer = async () => {
        const offerDescription = await pc.current.createOffer();
        await pc.current.setLocalDescription(offerDescription);
        await updateDoc(roomRef, { offer: { type: offerDescription.type, sdp: offerDescription.sdp } });
      }
      createOffer();
    }

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const messagesUnsubscribe = onSnapshot(q, (querySnapshot) => {
      setMessages(querySnapshot.docs.map((doc) => ({
        id: doc.id, ...doc.data(), sender: doc.data().senderId === user.uid ? 'You' : 'Stranger'
      })));
    });

    listenersRef.current.push(roomUnsubscribe, candidatesUnsubscribe, messagesUnsubscribe);

    return () => {
      listenersRef.current.forEach(unsubscribe => unsubscribe());
      listenersRef.current = [];
    };
  }, [chatRoomId, user, isCaller, userInfo]);

  const sendMessage = async (text) => {
    if (!chatRoomId || !user) return;

    const bannedWords = ['badword1', 'badword2', 'badword3']; // Placeholder
    const containsBannedWord = bannedWords.some(word => text.toLowerCase().includes(word));

    if (containsBannedWord) {
      setError('Your message contains inappropriate language and was not sent.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    await addDoc(messagesRef, { text, senderId: user.uid, createdAt: serverTimestamp() });
  };

  const leaveChat = async (shouldDeleteRoom = true) => {
    listenersRef.current.forEach(unsubscribe => unsubscribe());
    listenersRef.current = [];

    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
    }
    if (pc.current) {
        pc.current.close();
        pc.current = new RTCPeerConnection(servers);
    }

    if (shouldDeleteRoom && chatRoomId) {
      await deleteDoc(doc(db, 'chatRooms', chatRoomId));
    }
    if (waitingDocRef) {
      await deleteDoc(waitingDocRef);
      setWaitingDocRef(null);
    }

    setChatRoomId(null);
    setMessages([]);
    setPartnerId(null);
    setIsCaller(false);
    setLocalStream(null);
    setRemoteStream(null);
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
      messages: messages, // Add chat transcript to the report
    });
  };

  const blockUser = async () => {
    if (!user || !partnerId) return;
    const blockRef = doc(db, 'users', user.uid, 'blocked', partnerId);
    await setDoc(blockRef, { timestamp: serverTimestamp() });
    setBlockedUsers([...blockedUsers, partnerId]);
  };

  return { user, status, error, chatRoomId, messages, localStream, remoteStream, startSearching, leaveChat, sendMessage, reportUser, blockUser };
};

export default useChatService;
