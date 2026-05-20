import "server-only";
import { buildNewerDateRange, buildOlderDateRange, getLatestTradeDate, getOldestTradeDate } from "@/lib/syncBackfill";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type KisMarket = "KOSPI" | "KOSDAQ";
type KisIndexMarket = "KOSPI" | "KOSDAQ" | "KOSPI200";

interface SyncSummary {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

type KisRecord = Record<string, unknown>;

interface KisToken {
  accessToken: string;
  expiresAtMs: number;
}

const DEFAULT_BASE_URL = "https://openapi.koreainvestment.com:9443";
const KIS_INVESTOR_FLOW_PATH = "/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market";
const KIS_INVESTOR_FLOW_TR_ID = "FHPTJ04040000";
const KIS_INDEX_DAILY_PATH = "/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice";
const KIS_INDEX_DAILY_TR_ID = "FHKUP03500100";

const MARKET_PARAMS: Record<KisMarket, { marketCode: string; industryCode: string }> = {
  KOSPI: { marketCode: "KSP", industryCode: "0001" },
  KOSDAQ: { marketCode: "KSQ", industryCode: "1001" }
};
const INDEX_CODES: Record<KisIndexMarket, string> = {
  KOSPI: "0001",
  KOSDAQ: "1001",
  KOSPI200: "2001"
};

let tokenCache: KisToken | null = null;

const getBaseUrl = () => (process.env.KIS_OPENAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const getAppKey = () => process.env.KIS_OPENAPI_APP_KEY?.trim() ?? "";
const getAppSecret = () => process.env.KIS_OPENAPI_APP_SECRET?.trim() ?? "";

const toYmd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toIso = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

// Deprecated: keep only for future KIS endpoints that return raw KRW amounts.
// Investor-flow fields from KIS are already in million KRW and must not use this.
function krwToMillion(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : n / 1_000_000;
}

function ymdInRange(ymd: string, beginYmd: string, endYmd: string): boolean {
  return ymd.length === 8 && ymd >= beginYmd && ymd <= endYmd;
}

function buildDateRange(lastDays: number, lookbackBufferDays = 0): { beginYmd: string; endYmd: string; datesTried: number } {
  const end = new Date();
  const begin = new Date();
  begin.setDate(begin.getDate() - Math.max(0, lastDays - 1 + lookbackBufferDays));
  return {
    beginYmd: toYmd(begin),
    endYmd: toYmd(end),
    datesTried: lastDays
  };
}

function extractRecords(json: unknown): KisRecord[] {
  if (!json || typeof json !== "object") return [];
  const body = json as Record<string, unknown>;
  const candidates = [body.output, body.output1, body.output2];
  const records: KisRecord[] = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      records.push(...candidate.filter((v): v is KisRecord => Boolean(v) && typeof v === "object"));
    } else if (candidate && typeof candidate === "object") {
      records.push(candidate as KisRecord);
    }
  }

  return records;
}

function firstPresent(row: KisRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return null;
}

async function getAccessToken(): Promise<string> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  if (!appKey || !appSecret) {
    throw new Error("KIS OpenAPI credentials are missing. Set KIS_OPENAPI_APP_KEY and KIS_OPENAPI_APP_SECRET in .env.local.");
  }

  if (tokenCache && tokenCache.expiresAtMs - Date.now() > 60_000) return tokenCache.accessToken;

  const res = await fetch(`${getBaseUrl()}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret
    }),
    cache: "no-store"
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new Error(`KIS token request failed (${res.status}).`);
  }

  const accessToken = String(json.access_token ?? "");
  if (!accessToken) {
    throw new Error(`KIS token response missing access_token: ${String(json.msg1 ?? json.error_description ?? "unknown error")}`);
  }

  const expiresIn = toNumber(json.expires_in) ?? 86_400;
  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresIn - 60) * 1000
  };
  return accessToken;
}

// Deprecated: retained as a single-date diagnostic helper. Production investor-flow sync
// uses fetchInvestorFlowRows because this KIS endpoint returns recent multi-day rows.
async function fetchInvestorFlowForDate(market: KisMarket, ymd: string): Promise<{ rows: KisRecord[]; warning?: string }> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  const token = await getAccessToken();
  const marketParam = MARKET_PARAMS[market];
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: marketParam.industryCode,
    FID_INPUT_DATE_1: ymd,
    FID_INPUT_ISCD_1: marketParam.marketCode,
    FID_INPUT_DATE_2: ymd,
    FID_INPUT_ISCD_2: marketParam.industryCode
  });

  const res = await fetch(`${getBaseUrl()}${KIS_INVESTOR_FLOW_PATH}?${params.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_INVESTOR_FLOW_TR_ID,
      custtype: "P",
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) return { rows: [], warning: `[${ymd}] ${market} KIS request failed (${res.status}).` };
  if (String(json.rt_cd ?? "0") !== "0") {
    return { rows: [], warning: `[${ymd}] ${market} KIS error: ${String(json.msg_cd ?? "")} ${String(json.msg1 ?? "")}`.trim() };
  }

  return { rows: extractRecords(json) };
}

async function fetchInvestorFlowRows(market: KisMarket, beginYmd: string, endYmd: string): Promise<{ rows: KisRecord[]; warning?: string }> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  const token = await getAccessToken();
  const marketParam = MARKET_PARAMS[market];
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: marketParam.industryCode,
    FID_INPUT_DATE_1: endYmd,
    FID_INPUT_ISCD_1: marketParam.marketCode,
    FID_INPUT_DATE_2: endYmd,
    FID_INPUT_ISCD_2: marketParam.industryCode
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${getBaseUrl()}${KIS_INVESTOR_FLOW_PATH}?${params.toString()}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: KIS_INVESTOR_FLOW_TR_ID,
        custtype: "P",
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) return { rows: [], warning: `${market} KIS investor flow request failed (${res.status}).` };

    const msgCd = String(json.msg_cd ?? "");
    if (String(json.rt_cd ?? "0") === "0") {
      return {
        rows: extractRecords(json).filter((row) => {
          const ymd = String(firstPresent(row, ["stck_bsop_date", "bsop_date", "date"]) ?? "").replace(/[^\d]/g, "");
          return ymdInRange(ymd, beginYmd, endYmd);
        })
      };
    }
    if (msgCd === "EGW00201" && attempt < 2) {
      await delay(1_500);
      continue;
    }

    return { rows: [], warning: `${market} KIS investor flow error: ${msgCd} ${String(json.msg1 ?? "")}`.trim() };
  }

  return { rows: [], warning: `${market} KIS investor flow request failed after retries.` };
}

// Deprecated: index sync is intentionally handled by KRX OpenAPI.
// Keep the KIS index helpers only as a fallback reference; do not wire them into admin sync routes.
async function fetchIndexRows(market: KisIndexMarket, beginYmd: string, endYmd: string): Promise<{ rows: KisRecord[]; warning?: string }> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  const token = await getAccessToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: INDEX_CODES[market],
    FID_INPUT_DATE_1: beginYmd,
    FID_INPUT_DATE_2: endYmd,
    FID_PERIOD_DIV_CODE: "D"
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${getBaseUrl()}${KIS_INDEX_DAILY_PATH}?${params.toString()}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: KIS_INDEX_DAILY_TR_ID,
        custtype: "P",
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) return { rows: [], warning: `${market} KIS index request failed (${res.status}).` };

    const msgCd = String(json.msg_cd ?? "");
    if (String(json.rt_cd ?? "0") === "0") return { rows: extractRecords(json) };
    if (msgCd === "EGW00201" && attempt < 2) {
      await delay(1_500);
      continue;
    }

    return { rows: [], warning: `${market} KIS index error: ${msgCd} ${String(json.msg1 ?? "")}`.trim() };
  }

  return { rows: [], warning: `${market} KIS index request failed after retries.` };
}

function mapKisInvestorRow(row: KisRecord, market: KisMarket, fallbackYmd: string): Record<string, unknown> | null {
  const compactDate = String(firstPresent(row, ["stck_bsop_date", "bsop_date", "date"]) ?? fallbackYmd).replace(/[^\d]/g, "");
  const ymd = compactDate.length === 8 ? compactDate : fallbackYmd;

  const foreign = toNumber(firstPresent(row, ["frgn_ntby_tr_pbmn", "frgn_ntby_pbmn"]));
  const institution = toNumber(firstPresent(row, ["orgn_ntby_tr_pbmn", "orgn_ntby_pbmn"]));
  const individual = toNumber(firstPresent(row, ["prsn_ntby_tr_pbmn", "prsn_ntby_pbmn"]));

  if (foreign === null && institution === null && individual === null) return null;

  return {
    trade_date: toIso(ymd),
    market,
    foreign_net_buy: foreign,
    institution_net_buy: institution,
    individual_net_buy: individual,
    program_net_buy: null,
    created_at: new Date().toISOString()
  };
}

function mapKisIndexRows(rows: KisRecord[], market: KisIndexMarket, saveBeginYmd: string, saveEndYmd: string): Array<Record<string, unknown>> {
  const sorted = [...rows].sort((a, b) => {
    const ad = String(firstPresent(a, ["stck_bsop_date", "bsop_date", "date"]) ?? "");
    const bd = String(firstPresent(b, ["stck_bsop_date", "bsop_date", "date"]) ?? "");
    return ad.localeCompare(bd);
  });

  return sorted
    .map((row, index): Record<string, unknown> | null => {
      const compactDate = String(firstPresent(row, ["stck_bsop_date", "bsop_date", "date"]) ?? "").replace(/[^\d]/g, "");
      if (compactDate.length !== 8) return null;
      if (!ymdInRange(compactDate, saveBeginYmd, saveEndYmd)) return null;

      const close = toNumber(firstPresent(row, ["bstp_nmix_prpr", "close"]));
      if (close === null) return null;

      const prevClose = index > 0 ? toNumber(firstPresent(sorted[index - 1], ["bstp_nmix_prpr", "close"])) : null;
      const change = prevClose === null ? null : close - prevClose;
      const changeRate = prevClose === null || prevClose === 0 ? null : (change as number / prevClose) * 100;

      return {
        trade_date: toIso(compactDate),
        market,
        close,
        change,
        change_rate: changeRate,
        open: toNumber(firstPresent(row, ["bstp_nmix_oprc", "open"])),
        high: toNumber(firstPresent(row, ["bstp_nmix_hgpr", "high"])),
        low: toNumber(firstPresent(row, ["bstp_nmix_lwpr", "low"])),
        volume: toNumber(firstPresent(row, ["acml_vol", "volume"])),
        trading_value_million_krw: toNumber(firstPresent(row, ["acml_tr_pbmn", "trading_value_million_krw"])),
        created_at: new Date().toISOString()
      };
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

async function syncKisIndexRange(saveBeginYmd: string, endYmd: string, datesTried: number, fetchBeginYmd: string): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  const datesSucceeded = new Set<string>();

  for (const market of ["KOSPI", "KOSDAQ", "KOSPI200"] as const) {
    const result = await fetchIndexRows(market, fetchBeginYmd, endYmd);
    if (result.warning) {
      warnings.push(result.warning);
    } else if (result.rows.length === 0) {
      warnings.push(`${market} KIS index rows not found.`);
    } else {
      const mapped = mapKisIndexRows(result.rows, market, saveBeginYmd, endYmd);
      if (mapped.length === 0) {
        warnings.push(`${market} KIS index row mapping failed.`);
      } else {
        payload.push(...mapped);
        mapped.forEach((row) => datesSucceeded.add(String(row.trade_date)));
      }
    }

    await delay(1_200);
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("market_index_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`market_index_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded: datesSucceeded.size, warnings };
}

// Deprecated: use syncKrxIndexDaily from syncKrxOpenApi.ts for market_index_daily.
export async function syncKisIndexDaily(lastDays = 180): Promise<SyncSummary> {
  const { beginYmd: saveBeginYmd, endYmd, datesTried } = buildDateRange(lastDays);
  const { beginYmd: fetchBeginYmd } = buildDateRange(lastDays, 10);
  return syncKisIndexRange(saveBeginYmd, endYmd, datesTried, fetchBeginYmd);
}

// Deprecated: use syncKrxIndexBackfill from syncKrxOpenApi.ts for market_index_daily.
export async function syncKisIndexBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_index_daily");
  if (!oldest) return syncKisIndexDaily(lastDays);
  const saveRange = buildOlderDateRange(oldest, lastDays);
  const fetchRange = buildOlderDateRange(oldest, lastDays, 10);
  return syncKisIndexRange(saveRange.beginYmd, saveRange.endYmd, saveRange.datesTried, fetchRange.beginYmd);
}

async function syncKisInvestorFlowRange(beginYmd: string, endYmd: string, datesTried: number): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  const datesSucceeded = new Set<string>();

  for (const market of ["KOSPI", "KOSDAQ"] as const) {
    const result = await fetchInvestorFlowRows(market, beginYmd, endYmd);
    if (result.warning) {
      warnings.push(result.warning);
    } else if (result.rows.length === 0) {
      warnings.push(`${market} KIS investor flow rows not found.`);
    } else {
      const mapped = result.rows
        .map((row) => mapKisInvestorRow(row, market, endYmd))
        .filter((row): row is Record<string, unknown> => row !== null);
      if (mapped.length === 0) {
        warnings.push(`${market} KIS investor flow mapping failed.`);
      } else {
        payload.push(...mapped);
        mapped.forEach((row) => datesSucceeded.add(String(row.trade_date)));
      }
    }

    await delay(1_200);
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("investor_flow_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`investor_flow_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded: datesSucceeded.size, warnings };
}

export async function syncKisInvestorFlowDaily(lastDays = 180): Promise<SyncSummary> {
  const { beginYmd, endYmd, datesTried } = buildDateRange(lastDays);
  return syncKisInvestorFlowRange(beginYmd, endYmd, datesTried);
}

export async function syncKisInvestorFlowBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "investor_flow_daily");
  if (!oldest) return syncKisInvestorFlowDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildOlderDateRange(oldest, lastDays);
  return syncKisInvestorFlowRange(beginYmd, endYmd, datesTried);
}

export async function syncKisInvestorFlowUpdate(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "investor_flow_daily");
  if (!latest) return syncKisInvestorFlowDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildNewerDateRange(latest, lastDays);
  return syncKisInvestorFlowRange(beginYmd, endYmd, datesTried);
}
