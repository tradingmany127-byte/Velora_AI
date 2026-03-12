import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-63Q-WLv7ZPd3fYmMGWXCO2Vmmyr_5as",
  authDomain: "velora-ai-a6281.firebaseapp.com",
  projectId: "velora-ai-a6281",
  storageBucket: "velora-ai-a6281.appspot.com",
  messagingSenderId: "405549469349",
  appId: "1:405549469349:web:..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence).catch(console.error);
const googleProvider = new GoogleAuthProvider();

export { 
  auth,
  auth as firebaseAuth, 
  googleProvider, 
  sendEmailVerification,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
};