import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// React Native / Expo Go note:
// ❌ Do NOT use firebase/analytics here (web-only).
// If you need analytics later, we can add expo-firebase-analytics or native analytics in a dev build.

const firebaseConfig = {
  apiKey: "AIzaSyDkDn9-2QVLZe8yOOMZsl4ioOr7vLNm96k",
  authDomain: "imrc-racing-n-repair.firebaseapp.com",
  projectId: "imrc-racing-n-repair",
  storageBucket: "imrc-racing-n-repair.firebasestorage.app",
  messagingSenderId: "839652493357",
  appId: "1:839652493357:web:f15397f318552fd4fc50a4",
  measurementId: "G-1MLM66K5LB", // safe to keep; not used in RN
};

// Basic validation (helps catch accidental blanks)
const missing = Object.entries(firebaseConfig)
  .filter(([k, v]) => !v && k !== "measurementId")
  .map(([k]) => k);

if (missing.length) {
  throw new Error(`[Firebase] Missing config values: ${missing.join(", ")}`);
}

// Initialize Firebase (only once)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Persistent auth (Expo Go compatible)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // If already initialized, fall back
  auth = getAuth(app);
}

export const db = getFirestore(app);
export { auth };
export default app;
