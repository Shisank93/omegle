// useChatService.js
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
  updateDoc,
} from 'firebase/firestore';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

const firebaseConfig = {
        apiKey: "AIzaSyCKFdiShA5FNwYy3-jdBclGuQa8LGUvfEw",
        authDomain: "omegle-f0b32.firebaseapp.com",
        projectId: "omegle-f0b32",
        storageBucket: "omegle-f0b32.appspot.com", // Note: I corrected this from .firebasestorage.app to .appspot.com, which is the standard format.
        messagingSenderId: "926315634445",
        appId: "1:926315634445:web:283e76e6bfd4b9899a5a44"
        };
// Ensure single app instance across HMR / reloads
if (!globalThis._chatFirebaseApp) {
  globalThis._chatFirebaseApp = initializeApp(firebaseConfig);
}
const firebaseApp = globalThis._chatFirebaseApp;
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

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
  const [isCaller, setIsCaller] = useState(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const pc = useRef(null);
  const listenersRef = useRef([]);

  // Helper to add listener and keep ref for cleanup
  const pushListener = (unsub) => {
    if (unsub && typeof unsub === 'function') listenersRef.current.push(unsub);
  };

  // Initialize RTCPeerConnection when needed
  const ensurePeerConnection = () => {
    if (!pc.current) pc.current = new RTCPeerConnection(servers);

    // attach default handlers if not already attached
    pc.current.ontrack = (event) => {
      // remote stream (first stream)
      setRemoteStream(event.streams && event.streams[0] ? event.streams[0] : null);
    };

    pc.current.onicecandidate = (event) => {
      // ICE candidates are handled per-room in start/room logic
      // leaving handler blank here; concrete handlers added where room refs known
    };

    return pc.current;
  };

  // Sign in anonymously on mount
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setStatus('Authenticating...');
        const res = await signInAnonymously(auth);
        if (!mounted) return;
        const currentUser = res.user;
        setUser(currentUser);

        // load blocked users (if any)
        const blockedRef = collection(db, 'users', currentUser.uid, 'blocked');
        const blockedSnap = await getDocs(blockedRef);
        setBlockedUsers(blockedSnap.docs.map((d) => d.id));

        setStatus('Ready to chat. Fill the form to start.');
      } catch (err) {
        console.error('Sign-in error', err);
        setError('Failed to sign in.');
        setStatus('Error');
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, []);

  // Core: start searching for a partner and optionally enable media
  const startSearching = async (newUserInfo) => {
    if (!user) {
      setError('User not authenticated.');
      return;
    }

    setError(null);
    // Normalize interests to an array of strings
    const interests = newUserInfo.interests
      ? newUserInfo.interests
          .split(',')
          .map((i) => i.trim().toLowerCase())
          .filter(Boolean)
      : [];

    // Video allowed only if user indicates and age >= 18
    const isVideoAllowed = !!(newUserInfo.isVideo && newUserInfo.age >= 18);
    const userInfoWithInterests = { ...newUserInfo, interests, isVideo: isVideoAllowed };
    setUserInfo(userInfoWithInterests);

    // Acquire media if video requested
    if (isVideoAllowed) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        const connection = ensurePeerConnection();
        stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      } catch (err) {
        console.error('Media error', err);
        setError('Could not access camera/mic. Please allow access and try again.');
        setStatus('Error');
        return;
      }
    }

    setStatus('Searching for a partner...');
    const waitingPoolRef = collection(db, 'waitingPool');

    const myInfo = {
      userId: user.uid,
      userInfo: userInfoWithInterests,
      createdAt: serverTimestamp(),
    };

    const myDocRef = await addDoc(waitingPoolRef, myInfo);
    setWaitingDocRef(myDocRef);

    // Try to find partner (simple query excluding self)
    const findPartner = async () => {
      const q = query(waitingPoolRef, where('userId', '!=', user.uid), limit(10));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;

      // prefer partner not blocked and optionally with overlapping interests
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (!data || !data.userId) continue;
        if (blockedUsers.includes(data.userId)) continue;
        return docSnap;
      }
      return null;
    };

    try {
      const partnerDoc = await findPartner();
      if (partnerDoc) {
        const partnerData = partnerDoc.data();
        setPartnerId(partnerData.userId);
        setIsCaller(true);

        // create chat room
        const newRoomRef = doc(collection(db, 'chatRooms'));
        await setDoc(newRoomRef, {
          users: [user.uid, partnerData.userId],
          createdAt: serverTimestamp(),
          isVideo: userInfoWithInterests.isVideo || (partnerData.userInfo && partnerData.userInfo.isVideo),
        });
        setChatRoomId(newRoomRef.id);
        setStatus(`Matched with ${partnerData.userInfo?.name || 'a stranger'}!`);

        // Send invitation to partner (partner listens on invitations/<theirUserId>)
        const invitationRef = doc(db, 'invitations', partnerData.userId);
        await setDoc(invitationRef, {
          roomId: newRoomRef.id,
          from: user.uid,
          createdAt: serverTimestamp(),
        });

        // cleanup waiting documents
        await deleteDoc(myDocRef);
        await deleteDoc(partnerDoc.ref);
      } else {
        // no partner found immediately — listen for invitations
        setStatus('No one immediately available. Waiting for an invitation...');

        const invitationRef = doc(db, 'invitations', user.uid);
        const unsubInvitation = onSnapshot(invitationRef, async (snap) => {
          if (!snap.exists()) return;
          const invitation = snap.data();
          if (!invitation) return;

          // ignore invites from blocked users
          if (blockedUsers.includes(invitation.from)) {
            await deleteDoc(invitationRef).catch(() => {});
            return;
          }

          // accept invitation
          setPartnerId(invitation.from);
          setIsCaller(false);
          setChatRoomId(invitation.roomId);
          setStatus('You have been matched!');
          // remove invitation document after accepting
          await deleteDoc(invitationRef).catch(() => {});
        });

        pushListener(unsubInvitation);
      }
    } catch (err) {
      console.error('startSearching error', err);
      setError('Failed while searching for partners.');
    }
  };

  // Send a chat message
  const sendMessage = async (text) => {
    if (!chatRoomId || !user) return;
    // Simple profanity filter example - customize as needed
    const bannedWords = ['badword1', 'badword2', 'badword3'];
    const containsBanned = bannedWords.some((w) => text.toLowerCase().includes(w));
    if (containsBanned) {
      setError('Your message contains inappropriate language and was not sent.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    await addDoc(messagesRef, {
      text,
      sender: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  // Listen for chat room changes (messages + WebRTC signaling)
  useEffect(() => {
    if (!chatRoomId || !user) return;

    const roomRef = doc(db, 'chatRooms', chatRoomId);
    const offerCandidatesRef = collection(roomRef, 'offerCandidates');
    const answerCandidatesRef = collection(roomRef, 'answerCandidates');

    const connection = ensurePeerConnection();

    // onicecandidate writes to the right candidate collection
    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (isCaller) {
        addDoc(offerCandidatesRef, candidate).catch(console.error);
      } else {
        addDoc(answerCandidatesRef, candidate).catch(console.error);
      }
    };

    // attach remote track handler (already set in ensurePeerConnection)
    connection.ontrack = (event) => {
      setRemoteStream(event.streams && event.streams[0] ? event.streams[0] : null);
    };

    // Messages listener
    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt'));
    const unsubMessages = onSnapshot(messagesQuery, (snap) => {
      const newMessages = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: data.text,
          createdAt: data.createdAt,
          sender: data.sender === user.uid ? 'You' : 'Stranger',
        };
      });
      setMessages(newMessages);
    });
    pushListener(unsubMessages);

    // Room document listener (for offer/answer)
    const unsubRoom = onSnapshot(roomRef, async (snap) => {
      const data = snap.exists() ? snap.data() : null;
      if (!data) {
        // room deleted --> partner left
        setStatus('Partner disconnected. Chat ended.');
        // We keep local cleanup in leaveChat
        return;
      }

      // If we are caller and answer is set on room, apply it
      if (isCaller && data.answer && !connection.currentRemoteDescription) {
        try {
          const answerDesc = new RTCSessionDescription(data.answer);
          await connection.setRemoteDescription(answerDesc);
        } catch (err) {
          console.error('Error setting remote answer', err);
        }
      }

      // If we are callee and an offer appears, create & set answer
      if (!isCaller && data.offer && !connection.currentRemoteDescription) {
        try {
          const offerDesc = new RTCSessionDescription(data.offer);
          await connection.setRemoteDescription(offerDesc);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
        } catch (err) {
          console.error('Error handling offer -> answer', err);
        }
      }
    });
    pushListener(unsubRoom);

    // Candidate listeners (the caller listens to answerCandidates, callee to offerCandidates)
    const candidatesRefToListen = isCaller ? answerCandidatesRef : offerCandidatesRef;
    const unsubCandidates = onSnapshot(candidatesRefToListen, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const cand = change.doc.data();
          connection.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
        }
      });
    });
    pushListener(unsubCandidates);

    // If caller, create offer (only if isCaller === true)
    const maybeCreateOffer = async () => {
      if (!isCaller) return;
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });
      } catch (err) {
        console.error('Failed to create offer', err);
      }
    };
    maybeCreateOffer();

    // cleanup on effect unmount or chatRoomId change
    return () => {
      // do not delete room here; leaveChat handles that
      listenersRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          // ignore
        }
      });
      listenersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, user, isCaller]); // userInfo not required here

  // leaveChat: cleanup local media, RTCPeerConnection, listeners and optionally remove waiting doc / room
  const leaveChat = async (shouldDeleteRoom = true) => {
    // remove listeners
    listenersRef.current.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    listenersRef.current = [];

    // stop local media
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }

    // close peer connection
    if (pc.current) {
      try {
        pc.current.close();
      } catch (e) {}
      pc.current = null;
    }

    // delete waiting doc if exists
    if (waitingDocRef) {
      try {
        await deleteDoc(waitingDocRef);
      } catch (e) {}
      setWaitingDocRef(null);
    }

    // optionally delete chat room
    if (shouldDeleteRoom && chatRoomId) {
      try {
        await deleteDoc(doc(db, 'chatRooms', chatRoomId));
      } catch (e) {
        // ignore deletion errors
      }
    }

    setChatRoomId(null);
    setMessages([]);
    setPartnerId(null);
    setIsCaller(false);
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
      chatRoomId: chatRoomId || null,
      messages: messages || [],
    });
  };

  const blockUser = async () => {
    if (!user || !partnerId) return;
    const blockRef = doc(db, 'users', user.uid, 'blocked', partnerId);
    await setDoc(blockRef, { timestamp: serverTimestamp() });
    setBlockedUsers((prev) => (prev.includes(partnerId) ? prev : [...prev, partnerId]));
  };

  // cleanup on unmount: leave chat and sign out not handled here (optional)
  useEffect(() => {
    return () => {
      // stop everything
      listenersRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {}
      });
      listenersRef.current = [];
      if (localStream) {
        try {
          localStream.getTracks().forEach((t) => t.stop());
        } catch (e) {}
      }
      if (pc.current) {
        try {
          pc.current.close();
        } catch (e) {}
        pc.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsAudioMuted(!track.enabled);
      });
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsVideoMuted(!track.enabled);
      });
    }
  };

  return {
    user,
    status,
    error,
    chatRoomId,
    messages,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoMuted,
    startSearching,
    leaveChat,
    sendMessage,
    reportUser,
    blockUser,
    setError,
    toggleAudio,
    toggleVideo,
  };
};

export default useChatService;