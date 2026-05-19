import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import {
  syncKofiaAll,
  syncKofiaAllBackfill,
  syncKofiaCmaBackfill,
  syncKofiaCmaDaily,
  syncKofiaCreditBalanceBackfill,
  syncKofiaCreditBalanceDaily,
  syncKofiaMarketLiquidityBackfill,
  syncKofiaMarketLiquidityDaily
} from "@/lib/syncKofiaOpenApi";

type SyncType =
  | "kofia_liquidity"
  | "kofia_liquidity_backfill"
  | "kofia_credit_balance"
  | "kofia_credit_balance_backfill"
  | "kofia_cma"
  | "kofia_cma_backfill"
  | "kofia_all"
  | "kofia_all_backfill";

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; syncType?: SyncType };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const syncType = body.syncType ?? "kofia_all";

    if (syncType === "kofia_liquidity") {
      const result = await syncKofiaMarketLiquidityDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_liquidity_backfill") {
      const result = await syncKofiaMarketLiquidityBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_credit_balance") {
      const result = await syncKofiaCreditBalanceDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_credit_balance_backfill") {
      const result = await syncKofiaCreditBalanceBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_cma") {
      const result = await syncKofiaCmaDaily(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_cma_backfill") {
      const result = await syncKofiaCmaBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_all") {
      const result = await syncKofiaAll(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "kofia_all_backfill") {
      const result = await syncKofiaAllBackfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unsupported syncType: ${syncType}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
