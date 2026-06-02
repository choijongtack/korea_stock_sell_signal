import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SummaryKey =
  | "freesis_market_liquidity"
  | "freesis_credit_balance"
  | "freesis_cma"
  | "krx_index"
  | "investor_flow"
  | "ecos_m2"
  | "krx_market_breadth"
  | "krx_market_cap"
  | "krx_stock_daily";

type UploadSummaryRow = {
  key: SummaryKey;
  table: string;
  count: number;
  oldestDate: string | null;
  latestDate: string | null;
  error?: string;
};

const TARGETS: Array<{ key: SummaryKey; table: string }> = [
  { key: "freesis_market_liquidity", table: "market_liquidity_daily" },
  { key: "freesis_credit_balance", table: "market_credit_balance_daily" },
  { key: "freesis_cma", table: "market_cma_daily" },
  { key: "krx_index", table: "market_index_daily" },
  { key: "investor_flow", table: "investor_flow_daily" },
  { key: "ecos_m2", table: "market_m2_monthly" },
  { key: "krx_market_breadth", table: "market_breadth_daily" },
  { key: "krx_market_cap", table: "market_cap_daily" },
  { key: "krx_stock_daily", table: "krx_stock_daily" }
];

export async function GET() {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const rows: UploadSummaryRow[] = [];

    for (const target of TARGETS) {
      const { count, error: countError } = await supabase.from(target.table).select("trade_date", { count: "exact", head: true });
      if (countError) {
        rows.push({
          key: target.key,
          table: target.table,
          count: 0,
          oldestDate: null,
          latestDate: null,
          error: countError.message
        });
        continue;
      }

      const [oldestRes, latestRes] = await Promise.all([
        supabase.from(target.table).select("trade_date").order("trade_date", { ascending: true }).limit(1),
        supabase.from(target.table).select("trade_date").order("trade_date", { ascending: false }).limit(1)
      ]);

      const dateError = oldestRes.error ?? latestRes.error;
      rows.push({
        key: target.key,
        table: target.table,
        count: count ?? 0,
        oldestDate: oldestRes.data?.[0]?.trade_date ?? null,
        latestDate: latestRes.data?.[0]?.trade_date ?? null,
        error: dateError?.message
      });
    }

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
