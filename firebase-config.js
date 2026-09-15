// js/firebase-config.js
// এখানে আপনার Firebase প্রজেক্টের কনফিগ বসান
// Firebase Console > Project Settings > General > Your apps > SDK setup and configuration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyChNejHEZ3lk9IPa44okCYeMcc5y7tSbfc",
  authDomain: "kdc-guardian.firebaseapp.com",
  projectId: "kdc-guardian",
  storageBucket: "kdc-guardian.firebasestorage.app",
  messagingSenderId: "916474990476",
  appId: "1:916474990476:web:aa5056582082af1d14d0a9",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
