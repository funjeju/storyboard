import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { getAnalytics, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let analytics: Analytics | undefined;

if (typeof window !== "undefined" && firebaseConfig.apiKey) {
  app       = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth      = getAuth(app);
  db        = getFirestore(app);
  if (firebaseConfig.measurementId) {
    analytics = getAnalytics(app);
  }
}

export { auth, db, analytics };

export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  if (!auth) return null;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    return null;
  }
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

export async function saveStoryboard(userId: string, data: object) {
  if (!db) return null;
  try {
    const docRef = await addDoc(collection(db, "storyboards"), {
      userId,
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Save storyboard error:", error);
    return null;
  }
}
