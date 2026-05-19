import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertStocksFromKrx } from "@/lib/stocks/upsertStocksFromKrx";

type Market = "KOSPI" | "KOSDAQ" | "KOSPI200";

interface SyncSummary {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

interface MarketCapRow {
  trade_date: string;
  market: "KOSPI" | "KOSDAQ";
  market_cap_million_krw: number;
  listed_stock_count: number;
  created_at: string;
  updated_at: string;
}

const getBaseUrl = () => (process.env.KRX_OPENAPI_BASE_URL ?? "").replace(/\/+$/, "");
const getAuthKey = () => process.env.KRX_OPENAPI_AUTH_KEY ?? "";
const getAuthKeyKospi = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSPI ?? "";
const getAuthKeyKosdaq = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSDAQ ?? "";

const getIndexApiIdKospi = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI ?? "";
const getIndexApiIdKosdaq = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSDAQ ?? "";
const getIndexApiIdKospi200 = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI200 ?? "";

const getStocksApiIdKospi = () => process.env.KRX_OPENAPI_STOCKS_API_ID_KOSPI ?? "";
const getStocksApiIdKosdaq = () => process.env.KRX_OPENAPI_STOCKS_API_ID_KOSDAQ ?? "";

const toYmd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toIso = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return null;
};

function mapIndexRowToDaily(row: Record<string, unknown>, fallbackMarket: Market, ymd: string): Record<string, unknown> | null {
  // Support both index-style payload (CLSPRC_IDX...) and stock-style payload (TDD_CLSPRC...)
  const marketName = String(pick(row, ["IDX_NM", "MKT_NM"]) ?? "").toUpperCase();
  const market =
    marketName.includes("KOSPI200") ? "KOSPI200" : marketName.includes("KOSDAQ") ? "KOSDAQ" : marketName.includes("KOSPI") ? "KOSPI" : fallbackMarket;

  const close = num(pick(row, ["CLSPRC_IDX", "TDD_CLSPRC", "CLSPRC"]));
  const change = num(pick(row, ["CMPPREVDD_IDX", "CMPPREVDD_PRC", "CHG_PRC"]));
  const changeRate = num(pick(row, ["FLUC_RT", "CHG_RT"]));
  const open = num(pick(row, ["OPNPRC_IDX", "TDD_OPNPRC", "OPNPRC"]));
  const high = num(pick(row, ["HGPRC_IDX", "TDD_HGPRC", "HGPRC"]));
  const low = num(pick(row, ["LWPRC_IDX", "TDD_LWPRC", "LWPRC"]));
  const volume = num(pick(row, ["ACC_TRDVOL", "TOT_TRDVOL"]));
  const tradingValueRaw = num(pick(row, ["ACC_TRDVAL", "TOT_TRDVAL"]));

  // Guard: don't upsert invalid index rows.
  if (close === null) return null;

  return {
    trade_date: toIso(ymd),
    market,
    close,
    change,
    change_rate: changeRate,
    open,
    high,
    low,
    volume,
    trading_value_million_krw: tradingValueRaw === null ? null : tradingValueRaw / 1_000_000,
    created_at: new Date().toISOString()
  };
}

function authKeyFor(market: Market): string {
  if (market === "KOSPI" || market === "KOSPI200") return getAuthKeyKospi() || getAuthKey();
  return getAuthKeyKosdaq() || getAuthKey();
}

function apiIdForIndex(market: Market): string {
  if (market === "KOSPI") return getIndexApiIdKospi();
  if (market === "KOSDAQ") return getIndexApiIdKosdaq();
  return getIndexApiIdKospi200() || getIndexApiIdKospi();
}


function apiIdForStocks(market: Exclude<Market, "KOSPI200">): string {
  return market === "KOSPI" ? getStocksApiIdKospi() : getStocksApiIdKosdaq();
}

async function postRows(apiId: string, market: Market, basDd: string, apiGroup: "sto" | "idx" = "sto"): Promise<Record<string, unknown>[]> {
  const base = getBaseUrl();
  const key = authKeyFor(market);
  if (!base || !key || !apiId) return [];

  const candidates = [`${base}/svc/apis/${apiGroup}/${apiId}`, `${base}/svc/sample/apis/${apiGroup}/${apiId}`];
  for (const url of candidates) {
    const res = await fetch(url, {
      method: "POST",
      headers: { AUTH_KEY: key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ basDd }),
      cache: "no-store"
    });
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as { OutBlock_1?: Record<string, unknown>[] } | null;
    const rows = json?.OutBlock_1 ?? [];
    if (rows.length > 0) return rows;
  }
  return [];
}

function normalizeIndexName(value: unknown): string {
  return String(value ?? "").replace(/\s/g, "").toUpperCase();
}

function findIndexRow(rows: Record<string, unknown>[], market: Market): Record<string, unknown> | null {
  const wanted: Record<Market, string[]> = {
    KOSPI: ["KOSPI", "코스피"],
    KOSDAQ: ["KOSDAQ", "코스닥"],
    KOSPI200: ["KOSPI200", "코스피200"]
  };
  const normalizedWanted = wanted[market].map(normalizeIndexName);

  return (
    rows.find((row) => {
      const name = normalizeIndexName(row.IDX_NM);
      const close = num(row.CLSPRC_IDX);
      return close !== null && normalizedWanted.some((target) => name === target);
    }) ??
    rows.find((row) => {
      const name = normalizeIndexName(row.IDX_NM);
      const close = num(row.CLSPRC_IDX);
      return close !== null && normalizedWanted.some((target) => name.includes(target));
    }) ??
    null
  );
}

export async function syncKrxIndexDaily(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  let datesTried = 0;
  let datesSucceeded = 0;

  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = toYmd(d);
    datesTried += 1;
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ", "KOSPI200"] as const) {
      const apiId = apiIdForIndex(market);
      if (!apiId) continue;
      const rows = await postRows(apiId, market, ymd, "idx");
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} index rows not found.`);
        continue;
      }

      // Prefer an explicit index row when available.
      const candidate = findIndexRow(rows, market);
      if (!candidate) {
        warnings.push(`[${ymd}] ${market} index row mapping failed (target index not found). apiId=${apiId}`);
        continue;
      }

      const mapped = mapIndexRowToDaily(candidate, market, ymd);
      if (!mapped) {
        warnings.push(`[${ymd}] ${market} index row mapping failed (close missing). apiId=${apiId}`);
        continue;
      }
      payload.push(mapped);
      dayOk = true;
    }
    if (dayOk) datesSucceeded += 1;
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("market_index_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`market_index_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded, warnings };
}


export async function syncKrxStocksDaily(lastDays = 5): Promise<SyncSummary> {
  const warnings: string[] = [];
  let inserted = 0;
  let datesTried = 0;
  let datesSucceeded = 0;

  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = toYmd(d);
    datesTried += 1;

    const rowsForDay: Array<Record<string, unknown>> = [];
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const apiId = apiIdForStocks(market);
      if (!apiId) {
        warnings.push(`[${ymd}] ${market} stocks api id missing.`);
        continue;
      }
      const rows = await postRows(apiId, market, ymd);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} stocks rows not found.`);
        continue;
      }

      rowsForDay.push(...rows);
      dayOk = true;
    }

    if (rowsForDay.length > 0) {
      const result = await upsertStocksFromKrx(
        rowsForDay.map((row) => ({
          BAS_DD: String(row.BAS_DD ?? ymd),
          MKT_NM: String(row.MKT_NM ?? ""),
          ISU_CD: String(row.ISU_CD ?? row.ISU_SRT_CD ?? ""),
          ISU_NM: String(row.ISU_NM ?? row.ISU_ABBRV ?? ""),
          TDD_CLSPRC: row.TDD_CLSPRC == null ? undefined : String(row.TDD_CLSPRC),
          ACC_TRDVOL: row.ACC_TRDVOL == null ? undefined : String(row.ACC_TRDVOL)
        }))
      );
      inserted += result.count;
    }

    if (dayOk) datesSucceeded += 1;
  }

  return { inserted, datesTried, datesSucceeded, warnings };
}

export async function syncKrxMarketCapDaily(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: MarketCapRow[] = [];
  let datesTried = 0;
  let datesSucceeded = 0;

  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = toYmd(d);
    datesTried += 1;
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const apiId = apiIdForStocks(market);
      if (!apiId) {
        warnings.push(`[${ymd}] ${market} stocks api id missing.`);
        continue;
      }

      const rows = await postRows(apiId, market, ymd);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} market cap rows not found.`);
        continue;
      }

      const marketCapKrw = rows.reduce((sum, row) => sum + (num(row.MKTCAP) ?? 0), 0);
      const listedStockCount = rows.filter((row) => (num(row.MKTCAP) ?? 0) > 0).length;
      if (marketCapKrw <= 0 || listedStockCount === 0) {
        warnings.push(`[${ymd}] ${market} market cap aggregation failed.`);
        continue;
      }

      const now = new Date().toISOString();
      payload.push({
        trade_date: toIso(ymd),
        market,
        market_cap_million_krw: marketCapKrw / 1_000_000,
        listed_stock_count: listedStockCount,
        created_at: now,
        updated_at: now
      });
      dayOk = true;
    }

    if (dayOk) datesSucceeded += 1;
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("market_cap_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`market_cap_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded, warnings };
}
