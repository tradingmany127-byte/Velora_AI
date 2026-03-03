import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  sendSignInLinkToEmail 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-63Q-WLv7ZPd3fYmMGWXCO2Vmmyr_5as",
  authDomain: "velora-ai-a6281.firebaseapp.com",
  projectId: "velora-ai-a6281",
  storageBucket:  "velora-ai-a6281.firebasestorage.app",
  messagingSenderId: "405549469349",
  appId: "1:405549469349:web:e684826b2c7814e74dc74c",
  measurementId: "G-5V29S8RZ7X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { sendSignInLinkToEmail };