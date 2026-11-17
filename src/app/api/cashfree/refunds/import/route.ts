import { NextResponse } from "next/server";

import { HttpError, requireAdmin } from "@/lib/server/admin";
import { cashfreeConfigured } from "@/lib/server/cashfree";
import { importRefunds } from "@/lib/server/refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cashfree/refunds/import   { days?: number }   (admins only)
 * Fetches refunds from Cashfree for recent successful payments and saves them to
 * `cashfreeRefunds`. New refunds arrive by webhook; this fills in earlier ones.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    if (!cashfreeConfigured()) return NextResponse.json({ error: "Cashfree keys aren't set for the ops dashboard." }, { status: 500 });
    const body = (await request.json().catch(() => ({}))) as { days?: unknown };
    const days = typeof body.days === "number" && body.days > 0 && body.days <= 365 ? Math.floor(body.days) : 120;
    const result = await importRefunds(days);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[refunds import]", (err as Error).message);
    return NextResponse.json({ error: "Import failed. Try again in a minute." }, { status: 500 });
  }
}
