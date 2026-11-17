"use client";

import { useState } from "react";

import { Dashboard } from "@/components/Dashboard";
import { LoadingScreen, NoAccessScreen, SignInScreen } from "@/components/SignIn";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DEMO_STAFF, demoLeads } from "@/lib/demo";

const DEMO = process.env.NEXT_PUBLIC_OPS_DEMO === "1";

export default function Home() {
  const [demo] = useState(() => (DEMO ? demoLeads() : undefined));
  return (
    <AuthProvider demo={DEMO ? DEMO_STAFF : undefined}>
      <Gate demo={demo} />
    </AuthProvider>
  );
}

function Gate({ demo }: { demo?: ReturnType<typeof demoLeads> }) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "signed-out":
      return <SignInScreen error={state.error} />;
    case "denied":
      return <NoAccessScreen email={state.email} reason={state.reason} />;
    case "ready":
      return <Dashboard staff={state.staff} demo={demo} />;
  }
}
