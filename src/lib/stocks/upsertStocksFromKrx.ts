import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { KrxDailyStockRow, MarketType, StockMaster } from "@/types/stocks";

function toDateFromBasDd(basDd: string): string | null {
  if (!basDd || basDd.length !== 8) return null;
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function toNumber(value?: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarket(marketName: string): MarketType | null {
  const m = String(marketName ?? "").trim().toUpperCase();
  if (m === "KOSPI" || m.includes("코스피")) return "KOSPI";
  if (m === "KOSDAQ" || m.includes("코스닥")) return "KOSDAQ";
  return null;
}

type StockUpsertPayload = {
  stock_code: string;
  stock_name: string;
  market: MarketType;
  last_close: StockMaster["last_close"];
  last_volume: StockMaster["last_volume"];
  trade_date: string;
  updated_at: string;
};

export async function upsertStocksFromKrx(rows: KrxDailyStockRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { count: 0, message: "No KRX rows to upsert" };
  }

  const supabase = getSupabaseAdmin();

  const payload = rows
    .map((row) => {
      const market = normalizeMarket(row.MKT_NM);
      const tradeDate = toDateFromBasDd(row.BAS_DD);
      if (!market || !tradeDate || !row.ISU_CD || !row.ISU_NM) {
        return null;
      }
      return {
        stock_code: row.ISU_CD,
        stock_name: row.ISU_NM,
        market,
        last_close: toNumber(row.TDD_CLSPRC),
        last_volume: toNumber(row.ACC_TRDVOL),
        trade_date: tradeDate,
        updated_at: new Date().toISOString()
      };
    })
    .filter((row): row is StockUpsertPayload => row !== null);

  if (payload.length === 0) {
    return { count: 0, message: "No valid KRX stock rows" };
  }

  const { error } = await supabase.from("stocks").upsert(payload, {
    onConflict: "stock_code,market"
  });

  if (error) {
    console.error("[upsertStocksFromKrx] failed:", error);
    throw error;
  }

  return { count: payload.length, message: "Stocks upserted successfully" };
}
