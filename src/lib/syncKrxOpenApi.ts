import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Market = "KOSPI" | "KOSDAQ" | "KOSPI200";

interface SyncSummary {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

const getBaseUrl = () => (process.env.KRX_OPENAPI_BASE_URL ?? "").replace(/\/+$/, "");
const getAuthKey = () => process.env.KRX_OPENAPI_AUTH_KEY ?? "";
const getAuthKeyKospi = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSPI ?? "";
const getAuthKeyKosdaq = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSDAQ ?? "";

const getIndexApiIdKospi = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI ?? "";
const getIndexApiIdKosdaq = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSDAQ ?? "";
const getIndexApiIdKospi200 = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI200 ?? "";

const getInvestorApiIdKospi = () => process.env.KRX_OPENAPI_INVESTOR_FLOW_API_ID_KOSPI ?? "";
const getInvestorApiIdKosdaq = () => process.env.KRX_OPENAPI_INVESTOR_FLOW_API_ID_KOSDAQ ?? "";

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
  return getIndexApiIdKospi200();
}

function apiIdForInvestor(market: Exclude<Market, "KOSPI200">): string {
  return market === "KOSPI" ? getInvestorApiIdKospi() : getInvestorApiIdKosdaq();
}

async function postRows(apiId: string, market: Market, basDd: string): Promise<Record<string, unknown>[]> {
  const base = getBaseUrl();
  const key = authKeyFor(market);
  if (!base || !key || !apiId) return [];

  const candidates = [`${base}/svc/apis/sto/${apiId}`, `${base}/svc/sample/apis/sto/${apiId}`];
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
      const rows = await postRows(apiId, market, ymd);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} index rows not found.`);
        continue;
      }

      // Prefer an explicit index row when available.
      const candidate =
        rows.find((r) => typeof r.IDX_NM === "string" && String(r.IDX_NM).toUpperCase().includes(market)) ??
        rows.find((r) => "CLSPRC_IDX" in r || "CMPPREVDD_IDX" in r) ??
        rows[0];

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

export async function syncKrxInvestorFlowDaily(lastDays = 180): Promise<SyncSummary> {
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

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const apiId = apiIdForInvestor(market);
      if (!apiId) {
        warnings.push(`[${ymd}] ${market} investor flow api id missing.`);
        continue;
      }
      const rows = await postRows(apiId, market, ymd);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} investor flow rows not found.`);
        continue;
      }
      const row = rows[0];
      payload.push({
        trade_date: toIso(ymd),
        market,
        foreign_net_buy: num(row.FRGN_NET_BUY ?? row.FRGN_NTBY_TRDVOL ?? row.FRGN_NTBY_AMT),
        institution_net_buy: num(row.INST_NET_BUY ?? row.INST_NTBY_TRDVOL ?? row.INST_NTBY_AMT),
        individual_net_buy: num(row.INDI_NET_BUY ?? row.INDV_NTBY_TRDVOL ?? row.INDV_NTBY_AMT),
        program_net_buy: num(row.PROG_NET_BUY ?? row.PROG_NTBY_AMT),
        created_at: new Date().toISOString()
      });
      dayOk = true;
    }
    if (dayOk) datesSucceeded += 1;
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("investor_flow_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`investor_flow_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded, warnings };
}
