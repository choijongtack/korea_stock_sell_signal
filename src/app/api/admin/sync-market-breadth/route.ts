import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { syncMarketBreadthBackfill, syncMarketBreadthDaily, syncMarketBreadthUpdate } from "@/lib/syncMarketBreadth";

type Market = "KOSPI" | "KOSDAQ" | "ALL";

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; market?: Market; backfill?: boolean; update?: boolean };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const market: Market = body.market === "KOSPI" || body.market === "KOSDAQ" ? body.market : "ALL";
    const result = body.backfill
      ? await syncMarketBreadthBackfill(lastDays, market)
      : body.update
        ? await syncMarketBreadthUpdate(lastDays, market)
        : await syncMarketBreadthDaily(lastDays, market);
    return NextResponse.json({ ok: true, market, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
