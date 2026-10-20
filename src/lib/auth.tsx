"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { auth, isFirebaseConfigured, STAFF_DOMAIN, STAFF_ROLES, type StaffRole } from "@/lib/firebase";

export type Staff = { uid: string; email: string; name: string; photo: string | null; role: StaffRole };

type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; error?: string }
  /** Signed in with Google but not allowed in (wrong domain or no role yet). */
  | { status: "denied"; email: string; reason: "domain" | "role" }
  | { status: "ready"; staff: Staff };

type AuthContextValue = {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the role after an admin grants access (no need to sign out). */
  recheck: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isStaffEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${STAFF_DOMAIN}`);
}

async function resolve(user: User, forceRefresh = false): Promise<AuthState> {
  if (user.isAnonymous) return { status: "signed-out" };
  const email = user.email ?? "";
  if (!isStaffEmail(email)) return { status: "denied", email, reason: "domain" };
  const token = await user.getIdTokenResult(forceRefresh);
  const role = token.claims.role;
  if (typeof role !== "string" || !(STAFF_ROLES as readonly string[]).includes(role)) {
    return { status: "denied", email, reason: "role" };
  }
  return {
    status: "ready",
    staff: { uid: user.uid, email, name: user.displayName || email.split("@")[0]!, photo: user.photoURL, role: role as StaffRole },
  };
}

/**
 * Google sign-in, limited to @heynanny.in accounts, and only for people an
 * admin has given a role (`npm run role -- name@heynanny.in ops`).
 * The real protection is in Firestore rules; this only decides what to show.
 */
export function AuthProvider({ children, demo }: { children: ReactNode; demo?: Staff }) {
  const [state, setState] = useState<AuthState>(() =>
    demo
      ? { status: "ready", staff: demo }
      : isFirebaseConfigured
        ? { status: "loading" }
        : { status: "signed-out", error: "Firebase isn't configured. Add .env.local (see README)." },
  );

  useEffect(() => {
    if (demo || !isFirebaseConfigured) return;
    return onAuthStateChanged(auth(), async (user) => {
      if (!user) return setState({ status: "signed-out" });
      try {
        setState(await resolve(user));
      } catch {
        setState({ status: "signed-out", error: "Couldn't check your access. Please try again." });
      }
    });
  }, [demo]);

  const signIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    // Shows only @heynanny.in accounts in Google's picker (also checked after sign-in).
    provider.setCustomParameters({ hd: STAFF_DOMAIN, prompt: "select_account" });
    try {
      await signInWithPopup(auth(), provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      setState({
        status: "signed-out",
        error:
          code === "auth/unauthorized-domain"
            ? "This website isn't allowed to sign in yet. Add it under Firebase → Authentication → Settings → Authorized domains."
            : code === "auth/popup-blocked"
              ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
              : "Sign-in failed. Please try again.",
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!demo) await fbSignOut(auth());
    setState({ status: "signed-out" });
  }, [demo]);

  const recheck = useCallback(async () => {
    const user = auth().currentUser;
    if (user) setState(await resolve(user, true));
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut, recheck }), [state, signIn, signOut, recheck]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
