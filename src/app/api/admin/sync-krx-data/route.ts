import { NextResponse } from "next/server";
import { syncKrxIndexDaily, syncKrxInvestorFlowDaily, syncKrxStocksDaily } from "@/lib/syncKrxOpenApi";

type SyncType = "krx_index" | "krx_investor_flow" | "krx_stocks";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; syncType?: SyncType };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const syncType = body.syncType ?? "krx_index";

    if (syncType === "krx_index") {
      const result = await syncKrxIndexDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_investor_flow") {
      const result = await syncKrxInvestorFlowDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "krx_stocks") {
      const result = await syncKrxStocksDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unsupported syncType: ${syncType}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
