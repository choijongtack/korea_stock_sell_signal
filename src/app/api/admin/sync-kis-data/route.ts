import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { syncKisInvestorFlowBackfill, syncKisInvestorFlowDaily, syncKisInvestorFlowUpdate } from "@/lib/syncKisOpenApi";

type SyncType = "kis_investor_flow" | "kis_investor_flow_backfill" | "kis_investor_flow_update";

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; syncType?: SyncType };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const syncType = body.syncType ?? "kis_investor_flow";

    if (syncType === "kis_investor_flow") {
      const result = await syncKisInvestorFlowDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kis_investor_flow_backfill") {
      const result = await syncKisInvestorFlowBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }
    if (syncType === "kis_investor_flow_update") {
      const result = await syncKisInvestorFlowUpdate(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unsupported syncType: ${syncType}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
