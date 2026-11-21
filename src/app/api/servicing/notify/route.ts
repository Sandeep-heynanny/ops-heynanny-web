import { NextResponse } from "next/server";

import { interviewMessage, type InterviewEvent } from "@/lib/interview-push";
import { adminDb, HttpError, requireRole } from "@/lib/server/admin";
import { pushToPhone } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS: InterviewEvent[] = ["confirmed", "rescheduled", "cancelled", "unavailable", "suggested"];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/servicing/notify   (servicing, managers, admins)
 * { caseId, nannyId, event, at?, note? }
 * Sends the customer a push notification about an interview with one of the
 * nannies shared with them. The customer's phone and the nanny's name come from
 * the case, never from the request. A "suggested" time is also saved on the
 * case (interviewRequests.<nannyId>.teamSuggested) so the team can see it.
 * → { devices, sent }: devices = the customer's phones with the app and
 *   notifications on; 0 means tell them another way (WhatsApp).
 */
export async function POST(request: Request) {
  try {
    const { email } = await requireRole(request, ["servicing", "manager", "admin"]);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const caseId = typeof body?.caseId === "string" && ID_RE.test(body.caseId) ? body.caseId : null;
    const nannyId = typeof body?.nannyId === "string" && ID_RE.test(body.nannyId) ? body.nannyId : null;
    const event = EVENTS.includes(body?.event as InterviewEvent) ? (body!.event as InterviewEvent) : null;
    const at = typeof body?.at === "string" ? new Date(body.at) : null;
    const note = typeof body?.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 200) : null;
    if (!caseId || !nannyId || !event) return NextResponse.json({ error: "Missing details." }, { status: 400 });
    if (at && Number.isNaN(at.getTime())) return NextResponse.json({ error: "Invalid time." }, { status: 400 });
    if (event === "suggested" && (!at || at.getTime() < Date.now()))
      return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });

    const ref = adminDb().collection("servicing").doc(caseId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const phone = snap.get("customer.phone");
    const proposals = (snap.get("proposals") ?? []) as { nannyId?: string; sharedAt?: unknown; nanny?: { name?: string } }[];
    const p = proposals.find((x) => x.nannyId === nannyId);
    // Only nannies the family can see in the app.
    if (!p?.sharedAt) return NextResponse.json({ devices: 0, sent: 0, skipped: "not shared" });
    if (typeof phone !== "string" || !/^\+91[6-9]\d{9}$/.test(phone)) return NextResponse.json({ devices: 0, sent: 0 });

    const msg = interviewMessage(event, p.nanny?.name ?? "", at, note);
    const result = await pushToPhone(phone, { ...msg, data: { type: "interview", event, caseId, nannyId } });

    if (event === "suggested")
      await ref.update({
        [`interviewRequests.${nannyId}.teamSuggested`]: {
          at: at!,
          note: note || null,
          by: email,
          sentAt: new Date(),
          delivered: result.sent > 0,
        },
        updatedAt: new Date(),
        updatedBy: email,
      });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[notify]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't send the notification." }, { status: 502 });
  }
}
