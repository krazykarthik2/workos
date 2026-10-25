import { initializeApp, getApps } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

const firebaseConfig = {
  projectId: "glassbasekrazy",
  appId: "1:965311450816:web:ba2bdea1f0ce9ff3c16725",
  storageBucket: "glassbasekrazy.firebasestorage.app",
  apiKey: "AIzaSyDj9tuFzzN5z8OR7FP0Iee4HvFDl9pd65Y",
  authDomain: "glassbasekrazy.firebaseapp.com",
  messagingSenderId: "965311450816",
  projectNumber: "965311450816"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const registerWithEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const logoutUser = () => signOut(auth);
export const listenAuthState = (callback) => onAuthStateChanged(auth, callback);
