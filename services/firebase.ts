import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDYQ5QsQAKX1XDLBq6UVAFCiEXTSBXjtyA",
  authDomain: "faiaa-97494.firebaseapp.com",
  projectId: "faiaa-97494",
  storageBucket: "faiaa-97494.firebasestorage.app",
  messagingSenderId: "642448073764",
  appId: "1:642448073764:web:3dcb96d9fa57aa342924b1",
  measurementId: "G-DRGQJ4HQJ6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);