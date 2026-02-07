// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#available-libraries
const firebaseConfig = {
  apiKey: "AIzaSyCGDVrHGaYHX3uxQsWBFN1QIRZ97132OZc",
  authDomain: "foodstore-project-49263.firebaseapp.com",
  projectId: "foodstore-project-49263",
  storageBucket: "foodstore-project-49263.firebasestorage.app",
  messagingSenderId: "451585594600",
  appId: "1:451585594600:web:901bcbf994a5a77212a55d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
