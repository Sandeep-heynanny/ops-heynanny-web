"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import {
  LoadingScreen,
  NoAccessScreen,
  SignInScreen,
} from "@/components/SignIn";
import { AuthProvider, useAuth, type Staff } from "@/lib/auth";
import {
  canSeeEnquiries,
  canSeeNannies,
  canSeePayments,
  canSeeServicing,
  type StaffRole,
} from "@/lib/firebase";

/** The first page a role can open. */
export function homeFor(role: StaffRole) {
  if (canSeeEnquiries(role)) return "/";
  if (canSeeServicing(role)) return "/servicing";
  if (canSeeNannies(role)) return "/nannies";
  if (canSeePayments(role)) return "/payments";
  return "/";
}

/**
 * Sign-in + role check for a page. Firestore rules are the real protection;
 * this decides what to show.
 */
export function StaffPage({
  allow,
  demoStaff,
  what,
  children,
}: {
  allow: (role: StaffRole) => boolean;
  demoStaff?: Staff;
  /** e.g. "Servicing", for the "not for your role" message. */
  what: string;
  children: (staff: Staff) => ReactNode;
}) {
  return (
    <AuthProvider demo={demoStaff}>
      <Gate allow={allow} what={what}>
        {children}
      </Gate>
    </AuthProvider>
  );
}

function Gate({
  allow,
  what,
  children,
}: {
  allow: (role: StaffRole) => boolean;
  what: string;
  children: (staff: Staff) => ReactNode;
}) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "signed-out":
      return <SignInScreen error={state.error} />;
    case "denied":
      return <NoAccessScreen email={state.email} reason={state.reason} />;
    case "ready":
      return allow(state.staff.role) ? (
        <>{children(state.staff)}</>
      ) : (
        <NotForRole what={what} home={homeFor(state.staff.role)} />
      );
  }
}

function NotForRole({ what, home }: { what: string; home: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl text-plum">
          {what} isn&apos;t part of your role
        </h1>
        <p className="mt-2 text-sm text-muted">
          Ask an admin if you need access.
        </p>
        <Link
          href={home}
          className="mt-5 inline-flex h-10 items-center rounded-full bg-plum px-5 text-sm font-semibold text-milk"
        >
          Go to my dashboard
        </Link>
      </div>
    </main>
  );
}

/** Sends someone to their own home page (e.g. servicing team opening "/"). */
export function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return <LoadingScreen />;
}
