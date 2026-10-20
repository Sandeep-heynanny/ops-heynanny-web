"use client";

import { LockKeyhole, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { STAFF_DOMAIN } from "@/lib/firebase";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[400px] rounded-[26px] border border-line bg-paper p-8 text-center shadow-lift">
        <Logo className="mx-auto h-16 w-auto" priority />
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-rose-deep">Ops dashboard</p>
        {children}
      </div>
    </main>
  );
}

export function SignInScreen({ error }: { error?: string }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <h1 className="mt-4 font-display text-[1.75rem] leading-tight text-plum">Sign in to continue</h1>
      <p className="mt-2 text-sm text-muted">Use your @{STAFF_DOMAIN} Google account.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signIn();
          setBusy(false);
        }}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-plum px-6 text-[0.95rem] font-semibold text-milk transition-colors hover:bg-plum-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-left text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
        <LockKeyhole className="size-3.5" aria-hidden="true" />
        HeyNanny staff only. Access is by invitation.
      </p>
    </Shell>
  );
}

export function NoAccessScreen({ email, reason }: { email: string; reason: "domain" | "role" }) {
  const { signOut, recheck } = useAuth();
  const [checking, setChecking] = useState(false);
  return (
    <Shell>
      <h1 className="mt-4 font-display text-[1.75rem] leading-tight text-plum">No access yet</h1>
      <p className="mt-2 text-sm text-muted">
        You&apos;re signed in as <span className="font-semibold text-plum">{email}</span>.
      </p>
      <p className="mt-3 text-sm text-muted">
        {reason === "domain"
          ? `Only @${STAFF_DOMAIN} accounts can use this dashboard. Sign out and choose your work account.`
          : "Your account hasn't been given access. Ask an admin to add you, then press “Check again”."}
      </p>
      <div className="mt-6 grid gap-2">
        {reason === "role" && (
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await recheck();
              setChecking(false);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-plum px-5 text-sm font-semibold text-milk hover:bg-plum-soft disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
            Check again
          </button>
        )}
        <button
          type="button"
          onClick={signOut}
          className="inline-flex h-11 items-center justify-center rounded-full bg-paper px-5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white"
        >
          Sign out
        </button>
      </div>
    </Shell>
  );
}

export function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Logo className="h-14 w-auto opacity-80" priority />
        <p className="text-sm">Loading…</p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 rounded-full bg-white p-0.5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
