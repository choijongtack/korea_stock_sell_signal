import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import {
  syncKrxIndexBackfill,
  syncKrxIndexDaily,
  syncKrxIndexUpdate,
  syncKrxMarketCapBackfill,
  syncKrxMarketCapDaily,
  syncKrxMarketCapUpdate,
  syncKrxStocksBackfill,
  syncKrxStocksDaily,
  syncKrxStocksUpdate
} from "@/lib/syncKrxOpenApi";

type SyncType =
  | "krx_index"
  | "krx_index_backfill"
  | "krx_index_update"
  | "krx_stocks"
  | "krx_stocks_backfill"
  | "krx_stocks_update"
  | "krx_market_cap"
  | "krx_market_cap_backfill"
  | "krx_market_cap_update";

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; syncType?: SyncType };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const syncType = body.syncType ?? "krx_index";

    if (syncType === "krx_index") {
      const result = await syncKrxIndexDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_index_backfill") {
      const result = await syncKrxIndexBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }
    if (syncType === "krx_index_update") {
      const result = await syncKrxIndexUpdate(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_stocks") {
      const result = await syncKrxStocksDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_stocks_backfill") {
      const result = await syncKrxStocksBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }
    if (syncType === "krx_stocks_update") {
      const result = await syncKrxStocksUpdate(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_market_cap") {
      const result = await syncKrxMarketCapDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_market_cap_backfill") {
      const result = await syncKrxMarketCapBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }
    if (syncType === "krx_market_cap_update") {
      const result = await syncKrxMarketCapUpdate(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unsupported syncType: ${syncType}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
