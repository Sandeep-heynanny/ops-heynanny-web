"use client";

import Link from "next/link";
import { useState } from "react";

import { PaymentsDashboard } from "@/components/PaymentsDashboard";
import { LoadingScreen, NoAccessScreen, SignInScreen } from "@/components/SignIn";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DEMO_STAFF, demoPayments, demoRefunds, demoSettlements } from "@/lib/demo";

const DEMO = process.env.NEXT_PUBLIC_OPS_DEMO === "1";

/** /payments: Cashfree revenue and payments. Admins only (also enforced by Firestore rules). */
export default function PaymentsPage() {
  const [demo] = useState(() => (DEMO ? { payments: demoPayments(), refunds: demoRefunds(), settlements: demoSettlements() } : undefined));
  return (
    <AuthProvider demo={DEMO ? { ...DEMO_STAFF, role: "admin" } : undefined}>
      <Gate demo={demo} />
    </AuthProvider>
  );
}

type Demo = { payments: ReturnType<typeof demoPayments>; refunds: ReturnType<typeof demoRefunds>; settlements: ReturnType<typeof demoSettlements> };

function Gate({ demo }: { demo?: Demo }) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "signed-out":
      return <SignInScreen error={state.error} />;
    case "denied":
      return <NoAccessScreen email={state.email} reason={state.reason} />;
    case "ready":
      if (state.staff.role !== "admin") {
        return (
          <main className="grid min-h-dvh place-items-center px-4 text-center">
            <div>
              <h1 className="font-display text-2xl text-plum">Admins only</h1>
              <p className="mt-2 text-sm text-muted">Payments are visible to admins. Ask Sandeep if you need access.</p>
              <Link href="/" className="mt-5 inline-flex h-10 items-center rounded-full bg-plum px-5 text-sm font-semibold text-milk">
                Back to enquiries
              </Link>
            </div>
          </main>
        );
      }
      return <PaymentsDashboard staff={state.staff} demo={demo} />;
  }
}
