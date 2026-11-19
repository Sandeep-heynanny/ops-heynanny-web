import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId,
);

function app() {
  if (!isFirebaseConfigured)
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local.",
    );
  return getApps().length ? getApp() : initializeApp(config);
}

export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
export const storage = () => getStorage(app());

/** Only Google Workspace accounts on this domain can use the dashboard. */
export const STAFF_DOMAIN = "heynanny.in";
/**
 * Roles (Sandeep, 2026-11-17):
 *   admin     everything
 *   manager   everything except Payments
 *   sales     Enquiries only (was called "ops"; old "ops" accounts are treated as sales)
 *   servicing Servicing (all of it) + Nannies (view, add, edit)
 *   supply    Nannies only (view, add, edit)
 */
export const STAFF_ROLES = [
  "sales",
  "servicing",
  "supply",
  "manager",
  "admin",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The role claim on a sign-in token, with the old name "ops" read as "sales". */
export function roleFromClaim(claim: unknown): StaffRole | null {
  if (claim === "ops") return "sales";
  return typeof claim === "string" &&
    (STAFF_ROLES as readonly string[]).includes(claim)
    ? (claim as StaffRole)
    : null;
}

/** What each role can open. Firestore and Storage rules enforce the same split. */
export const canSeeEnquiries = (role: StaffRole) =>
  role === "sales" || role === "manager" || role === "admin";
export const canSeeServicing = (role: StaffRole) =>
  role === "servicing" || role === "manager" || role === "admin";
/** Nannies page: view, add and edit nannies (photos, documents). */
/** Read a servicing case: the servicing side, plus sales (read-only, in the enquiry drawer) so they can update the customer. */
export const canReadServicing = (role: StaffRole) =>
  canSeeEnquiries(role) || canSeeServicing(role);
export const canSeeNannies = (role: StaffRole) =>
  role === "servicing" ||
  role === "supply" ||
  role === "manager" ||
  role === "admin";
export const canSeePayments = (role: StaffRole) => role === "admin";
/** Only admins may export / download nanny data (it's sensitive). */
export const canExportNannies = (role: StaffRole) => role === "admin";
/** Managers and admins can bulk-import nannies from a CSV. */
export const canImportNannies = (role: StaffRole) =>
  role === "manager" || role === "admin";
