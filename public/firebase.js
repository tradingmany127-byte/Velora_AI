import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "ТУТ ТВОЙ apiKey",
  authDomain: "ТУТ ТВОЙ authDomain",
  projectId: "ТУТ ТВОЙ projectId",
  storageBucket: "ТУТ ТВОЙ storageBucket",
  messagingSenderId: "ТУТ ТВОЙ messagingSenderId",
  appId: "ТУТ ТВОЙ appId",
  measurementId: "ТУТ ТВОЙ measurementId"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();