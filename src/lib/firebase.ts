import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Same Firebase project as the website (hey-nanny-web), registered as the
 * "HeyNanny Ops" web app. Config is public by design; access is enforced by
 * Firestore rules (staff role claim), which live in the website repo.
 * Analytics is intentionally not used, so staff activity never mixes with
 * customer data.
 */
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

function app() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured. Copy .env.example to .env.local.");
  return getApps().length ? getApp() : initializeApp(config);
}

export const auth = () => getAuth(app());
export const db = () => getFirestore(app());

/** Only Google Workspace accounts on this domain can use the dashboard. */
export const STAFF_DOMAIN = "heynanny.in";
export const STAFF_ROLES = ["ops", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
