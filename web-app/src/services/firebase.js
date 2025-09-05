import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// IMPORTANT:
// Replace the placeholder values below with your own Firebase project's configuration.
// For security, it is highly recommended to use environment variables to store these keys.
// In a Vite project, you can create a .env.local file in the root of your `web-app` directory
// and store your keys there, prefixed with VITE_.
// Example: VITE_API_KEY="your-api-key"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_APP_ID || "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Function to sign in the user anonymously
const signIn = async () => {
  try {
    await signInAnonymously(auth);
    return auth.currentUser;
  } catch (error) {
    console.error("Anonymous sign-in failed:", error);
    throw error;
  }
};

export { db, auth, signIn };
