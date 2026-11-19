import { NextResponse } from "next/server";

import { HttpError, requireAdmin } from "@/lib/server/admin";
import { initiateCaseRefund, syncCaseRefund } from "@/lib/server/case-refund";
import { CashfreeError } from "@/lib/server/cashfree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/servicing/refund   (admins only)
 *   { action: "initiate", caseId, orderId, amount, note }  refund a cancelled case through Cashfree
 *   { action: "sync", caseId }                             refresh its refunds from Cashfree
 */
export async function POST(request: Request) {
  try {
    const { email } = await requireAdmin(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const caseId = typeof body?.caseId === "string" && ID_RE.test(body.caseId) ? body.caseId : null;
    if (!caseId) return NextResponse.json({ error: "Missing case ID." }, { status: 400 });

    if (body?.action === "sync") {
      const message = await syncCaseRefund(caseId, email);
      return NextResponse.json({ ok: true, message });
    }
    if (body?.action !== "initiate") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const orderId = typeof body.orderId === "string" && body.orderId.length <= 100 ? body.orderId : null;
    const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
    const rawNote = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim() : "";
    // Cashfree wants a 3–100 character note.
    const note = (rawNote.length >= 3 ? rawNote : "Servicing case cancelled").slice(0, 100);
    if (!orderId) return NextResponse.json({ error: "Pick the payment to refund." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });

    const message = await initiateCaseRefund(caseId, { orderId, amount, note }, email);
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof CashfreeError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[servicing-refund]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't complete the refund request." }, { status: 500 });
  }
}
