import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDR5ESnHuv6bsin9jFrEm3gTbMdySVpGZE",
  authDomain: "chating-class.firebaseapp.com",
  projectId: "chating-class",
  storageBucket: "chating-class.appspot.com", // Corrected storage bucket domain
  messagingSenderId: "66220288730",
  appId: "1:66220288730:web:abc61ad5a32a5ac2add3e3",
  measurementId: "G-5RCN429FJK"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
