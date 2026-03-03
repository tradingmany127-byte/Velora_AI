import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  sendSignInLinkToEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "ТВОЙ_КЛЮЧ",
  authDomain: "velora-ai-a6281.firebaseapp.com",
  projectId: "velora-ai-a6281",
  storageBucket: "velora-ai-a6281.appspot.com",
  messagingSenderId: "405549469349",
  appId: "1:405549469349:web:..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider, sendSignInLinkToEmail };