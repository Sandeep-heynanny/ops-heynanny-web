import { NextResponse } from "next/server";

import { HttpError, requireAdmin } from "@/lib/server/admin";
import { CashfreeError, fetchSettlements } from "@/lib/server/cashfree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cashfree/settlements?from=<epoch ms>&to=<epoch ms>   (admins only)
 * Settlements straight from Cashfree for [from, to).
 */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 400 * 86_400_000) {
      return NextResponse.json({ error: "Invalid date range (max 400 days)." }, { status: 400 });
    }
    const settlements = await fetchSettlements(new Date(from), new Date(to));
    return NextResponse.json({ settlements }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof CashfreeError) {
      console.error("[settlements]", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[settlements]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't load settlements." }, { status: 500 });
  }
}
