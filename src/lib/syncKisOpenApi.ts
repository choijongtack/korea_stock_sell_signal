import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type KisMarket = "KOSPI" | "KOSDAQ";

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

const MARKET_PARAMS: Record<KisMarket, { marketCode: string; industryCode: string }> = {
  KOSPI: { marketCode: "KSP", industryCode: "0001" },
  KOSDAQ: { marketCode: "KSQ", industryCode: "1001" }
};

let tokenCache: KisToken | null = null;

const getBaseUrl = () => (process.env.KIS_OPENAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const getAppKey = () => process.env.KIS_OPENAPI_APP_KEY?.trim() ?? "";
const getAppSecret = () => process.env.KIS_OPENAPI_APP_SECRET?.trim() ?? "";

const toYmd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toIso = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function krwToMillion(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : n / 1_000_000;
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

function mapKisInvestorRow(row: KisRecord, market: KisMarket, fallbackYmd: string): Record<string, unknown> | null {
  const compactDate = String(firstPresent(row, ["stck_bsop_date", "bsop_date", "date"]) ?? fallbackYmd).replace(/[^\d]/g, "");
  const ymd = compactDate.length === 8 ? compactDate : fallbackYmd;

  const foreign = krwToMillion(firstPresent(row, ["frgn_ntby_tr_pbmn", "frgn_ntby_pbmn"]));
  const institution = krwToMillion(firstPresent(row, ["orgn_ntby_tr_pbmn", "orgn_ntby_pbmn"]));
  const individual = krwToMillion(firstPresent(row, ["prsn_ntby_tr_pbmn", "prsn_ntby_pbmn"]));

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

export async function syncKisInvestorFlowDaily(lastDays = 180): Promise<SyncSummary> {
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
      const result = await fetchInvestorFlowForDate(market, ymd);
      if (result.warning) {
        warnings.push(result.warning);
        continue;
      }
      if (result.rows.length === 0) {
        warnings.push(`[${ymd}] ${market} KIS investor flow rows not found.`);
        continue;
      }

      const mapped = mapKisInvestorRow(result.rows[0], market, ymd);
      if (!mapped) {
        warnings.push(`[${ymd}] ${market} KIS investor flow mapping failed.`);
        continue;
      }
      payload.push(mapped);
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
