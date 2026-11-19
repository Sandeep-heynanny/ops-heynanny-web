import { NextResponse } from "next/server";

import { HttpError, requireAdmin } from "@/lib/server/admin";
import { cashfreeConfigured } from "@/lib/server/cashfree";
import { importPayments } from "@/lib/server/payments-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cashfree/payments/import   { days?: number }   (admins only)
 * Brings in payments from Cashfree that the webhook never saw (before 11 Nov 2026,
 * or missed). Safe to run again: payments already saved are left alone.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    if (!cashfreeConfigured()) return NextResponse.json({ error: "Cashfree keys aren't set for the ops dashboard." }, { status: 500 });
    const body = (await request.json().catch(() => ({}))) as { days?: unknown };
    const days = typeof body.days === "number" && body.days > 0 && body.days <= 365 ? Math.floor(body.days) : 120;
    const result = await importPayments(days);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[payments import]", (err as Error).message);
    return NextResponse.json({ error: "Import failed. Try again in a minute." }, { status: 500 });
  }
}
