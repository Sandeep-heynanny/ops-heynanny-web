
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin on the server (App Hosting's service account, or
 * `gcloud auth application-default login` locally). Never imported by client code.
 */
function app() {
  return getApps()[0] ?? initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "hey-nanny-web" });
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Checks the `Authorization: Bearer <Firebase ID token>` header and that the
 * caller is an admin on a verified @heynanny.in account (same rule as Firestore).
 */
export async function requireAdmin(request: Request): Promise<{ uid: string; email: string }> {
  return requireRole(request, ["admin"]);
}

/** Same check for a set of roles (e.g. everyone who works on enquiries). */
export async function requireRole(request: Request, roles: string[]): Promise<{ uid: string; email: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    throw new HttpError(401, "Not signed in");
  }
  const email = decoded.email ?? "";
  if (typeof decoded.role !== "string" || !roles.includes(decoded.role) || !email.endsWith("@heynanny.in") || decoded.email_verified !== true) {
    throw new HttpError(403, roles.length === 1 && roles[0] === "admin" ? "Admins only" : "Not allowed for your role");
  }
  return { uid: decoded.uid, email };
}
