"use client";

import { auth } from "@/lib/firebase";
import type { InterviewEvent } from "@/lib/interview-push";

export type NotifyResult = { devices: number; sent: number; skipped?: string };

/** Push an interview update to the customer's app (see /api/servicing/notify). */
export async function notifyCustomer(input: {
  caseId: string;
  nannyId: string;
  event: InterviewEvent;
  at?: Date | null;
  note?: string;
}): Promise<NotifyResult> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/servicing/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ ...input, at: input.at ? input.at.toISOString() : undefined }),
  });
  const body = (await res.json().catch(() => null)) as (NotifyResult & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Couldn't send the notification.");
  return body;
}
