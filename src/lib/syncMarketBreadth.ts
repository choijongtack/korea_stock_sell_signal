// import "server-only";
import { buildNewerIsoDates, buildOlderIsoDates, getLatestTradeDate, getOldestTradeDate } from "@/lib/syncBackfill";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureKrxStockDailyRows } from "@/lib/syncKrxStockDaily";

type MarketKind = "KOSPI" | "KOSDAQ";

interface BreadthRow {
  trade_date: string;
  market: MarketKind;
  advancers: number;
  decliners: number;
  unchanged: number;
  trading_value_million_krw: number;
  created_at: string;
}

interface SyncResult {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

const KRX_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_REFERER = "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd";
const KRX_LOGOUT_SIGNATURE = "LOGOUT";
const getKrxBaseUrl = () => process.env.KRX_OPENAPI_BASE_URL ?? "";
const getKrxAuthKey = () => process.env.KRX_OPENAPI_AUTH_KEY ?? "";
const getKrxAuthKeyKospi = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSPI ?? "";
const getKrxAuthKeyKosdaq = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSDAQ ?? "";
const getKrxBreadthApiIdKospi = () => process.env.KRX_OPENAPI_BREADTH_API_ID_KOSPI ?? "";
const getKrxBreadthApiIdKosdaq = () => process.env.KRX_OPENAPI_BREADTH_API_ID_KOSDAQ ?? "";

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseNum(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const key of aliases) {
    if (key in row) return row[key];
  }
  return null;
}

function getFieldIgnoreCase(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalizedMap.set(key.toLowerCase(), value);
  }
  for (const key of aliases) {
    const value = normalizedMap.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return null;
}

function classifyMove(row: Record<string, unknown>): -1 | 0 | 1 {
  const cmp = parseNum(getField(row, ["CMPPREVDD_PRC", "FLUC_TP_CD", "FLUC_TP"]));
  if (cmp > 0) return 1;
  if (cmp < 0) return -1;

  const rate = parseNum(getField(row, ["FLUC_RT", "등락률"]));
  if (rate > 0) return 1;
  if (rate < 0) return -1;
  return 0;
}

function getTradingValueMillion(row: Record<string, unknown>): number {
  const raw = parseNum(
    getField(row, ["ACC_TRDVAL", "TDD_TRDVAL", "TRDVAL", "거래대금", "ACC_TRDVAL_MKT", "MKTCAP"])
  );
  // Most KRX endpoints return KRW. convert to million KRW.
  return raw / 1_000_000;
}

function extractRowsFromPayload(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const candidates = [
    root["OutBlock_1"],
    root["output"],
    root["result"],
    root["data"],
    root["items"],
    root["OutBlock"],
    root["response"]
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
    }
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of ["items", "item", "OutBlock_1", "output", "data"]) {
        const nestedCandidate = nested[nestedKey];
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
        }
      }
    }
  }
  return [];
}

function resolveOpenApiId(market: MarketKind): string {
  return market === "KOSPI" ? getKrxBreadthApiIdKospi() : getKrxBreadthApiIdKosdaq();
}

function resolveOpenApiAuthKey(market: MarketKind): string {
  if (market === "KOSPI" && getKrxAuthKeyKospi()) return getKrxAuthKeyKospi();
  if (market === "KOSDAQ" && getKrxAuthKeyKosdaq()) return getKrxAuthKeyKosdaq();
  return getKrxAuthKey();
}

function canUseKrxOpenApi(): boolean {
  return Boolean(getKrxBaseUrl() && (getKrxAuthKey() || getKrxAuthKeyKospi() || getKrxAuthKeyKosdaq()));
}

function parseOpenApiAggregatedRow(trdDd: string, market: MarketKind, row: Record<string, unknown>): BreadthRow | null {
  const advancers = parseNumberOrNull(getFieldIgnoreCase(row, ["advancers", "up_cnt", "up_count", "rising_issue_cnt", "상승종목수"]));
  const decliners = parseNumberOrNull(getFieldIgnoreCase(row, ["decliners", "down_cnt", "down_count", "falling_issue_cnt", "하락종목수"]));
  const unchanged = parseNumberOrNull(getFieldIgnoreCase(row, ["unchanged", "flat_cnt", "equal_cnt", "보합종목수"]));
  const tradingValueRaw = parseNumberOrNull(
    getFieldIgnoreCase(row, ["trading_value_million_krw", "trdval_mil", "trading_value", "acc_trdval", "거래대금"])
  );
  if (advancers === null || decliners === null || unchanged === null || tradingValueRaw === null) return null;

  const tradingValueMillionKrw = tradingValueRaw > 1_000_000_000 ? tradingValueRaw / 1_000_000 : tradingValueRaw;
  return {
    trade_date: toIsoDate(trdDd),
    market,
    advancers,
    decliners,
    unchanged,
    trading_value_million_krw: Math.round(tradingValueMillionKrw),
    created_at: new Date().toISOString()
  };
}

function parseNumberOrNull(value: unknown): number | null {
  const n = parseNum(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchKrxOpenApiBreadth(trdDd: string, market: MarketKind): Promise<BreadthRow | null> {
  if (!canUseKrxOpenApi()) return null;
  const apiId = resolveOpenApiId(market);
  const authKey = resolveOpenApiAuthKey(market);
  if (!apiId) return null;
  if (!authKey) return null;

  const base = getKrxBaseUrl().replace(/\/+$/, "");
  const postCandidates = [
    `${base}/svc/apis/sto/${apiId}`,
    `${base}/svc/sample/apis/sto/${apiId}`
  ];
  const getCandidates = [
    `${base}/svc/apis/sto/${apiId}?basDd=${trdDd}`,
    `${base}/svc/apis/sto/${apiId}?trdDd=${trdDd}`,
    `${base}/svc/sample/apis/sto/${apiId}?basDd=${trdDd}`,
    `${base}/svc/sample/apis/sto/${apiId}?trdDd=${trdDd}`,
    `${base}/${apiId}.json?trdDd=${trdDd}`,
    `${base}/${apiId}?trdDd=${trdDd}&format=json`,
    `${base}/svc/apis/${apiId}/json?trdDd=${trdDd}`
  ];

  for (const url of postCandidates) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        AUTH_KEY: authKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ basDd: trdDd }),
      cache: "no-store"
    });
    if (!res.ok) {
      continue;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      continue;
    }

    const rows = extractRowsFromPayload(json);
    if (rows.length === 0) continue;
    const aggregated = parseOpenApiAggregatedRow(trdDd, market, rows[0]);
    if (aggregated) return aggregated;
    return aggregateBreadth(trdDd, market, rows);
  }

  for (const url of getCandidates) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        AUTH_KEY: authKey,
        Accept: "application/json"
      },
      cache: "no-store"
    });
    if (!res.ok) {
      continue;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      continue;
    }

    const rows = extractRowsFromPayload(json);
    if (rows.length === 0) continue;

    // Case 1) already aggregated row exists.
    const aggregated = parseOpenApiAggregatedRow(trdDd, market, rows[0]);
    if (aggregated) return aggregated;

    // Case 2) security-level rows; aggregate ourselves.
    return aggregateBreadth(trdDd, market, rows);
  }

  return null;
}

async function fetchKrxRows(trdDd: string, market: MarketKind): Promise<Record<string, unknown>[]> {
  const bldCandidates = [
    "dbms/MDC/STAT/standard/MDCSTAT01501", // 전종목 시세(후보)
    "dbms/MDC/STAT/standard/MDCSTAT00601", // 시장별 통계(후보)
    "dbms/MDC/STAT/standard/MDCSTAT01402" // 등락률 통계(후보)
  ];
  const mktCandidates = market === "KOSPI" ? ["STK", "KOSPI"] : ["KSQ", "KOSDAQ"];

  for (const bld of bldCandidates) {
    for (const mktId of mktCandidates) {
      const params = new URLSearchParams();
      params.set("bld", bld);
      params.set("locale", "ko_KR");
      params.set("mktId", mktId);
      params.set("trdDd", trdDd);
      params.set("share", "1");
      params.set("money", "1");
      params.set("csvxls_isNo", "false");

      const res = await fetch(KRX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0",
          Referer: KRX_REFERER
        },
        body: params.toString(),
        cache: "no-store"
      });

      const responseText = await res.text();
      if (!res.ok || responseText.trim() === KRX_LOGOUT_SIGNATURE) {
        if (responseText.trim() === KRX_LOGOUT_SIGNATURE) {
          throw new Error(
            "KRX request blocked with LOGOUT. Automatic sync via unauthenticated server request is currently unavailable. Use CSV upload or authenticated KRX session pipeline."
          );
        }
        continue;
      }

      let json: { OutBlock_1?: Record<string, unknown>[]; output?: Record<string, unknown>[] };
      try {
        json = JSON.parse(responseText) as { OutBlock_1?: Record<string, unknown>[]; output?: Record<string, unknown>[] };
      } catch {
        continue;
      }
      const rows = (json.OutBlock_1 ?? json.output ?? []).filter((r) => typeof r === "object" && r !== null);
      if (rows.length > 0) return rows;
    }
  }

  return [];
}

function aggregateBreadth(trdDd: string, market: MarketKind, rows: Record<string, unknown>[]): BreadthRow {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let tradingValueMillionKrw = 0;

  for (const row of rows) {
    const move = classifyMove(row);
    if (move > 0) advancers += 1;
    else if (move < 0) decliners += 1;
    else unchanged += 1;
    tradingValueMillionKrw += getTradingValueMillion(row);
  }

  return {
    trade_date: toIsoDate(trdDd),
    market,
    advancers,
    decliners,
    unchanged,
    trading_value_million_krw: Math.round(tradingValueMillionKrw),
    created_at: new Date().toISOString()
  };
}

export async function syncMarketBreadthDaily(lastDays = 180, targetMarket: MarketKind | "ALL" = "ALL"): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: BreadthRow[] = [];

  let datesTried = 0;
  let datesSucceeded = 0;

  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const trdDd = toYmd(d);
    datesTried += 1;

    let dayOk = false;
    const markets = targetMarket === "ALL" ? (["KOSPI", "KOSDAQ"] as const) : ([targetMarket] as const);
    for (const market of markets) {
      const { rows, warning } = await ensureKrxStockDailyRows(trdDd, market);
      if (rows.length === 0) {
        warnings.push(`[${trdDd}] ${market} stock daily rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }
      if (warning) warnings.push(`[${trdDd}] ${market} ${warning}`);
      payload.push(aggregateBreadth(trdDd, market, rows));
      dayOk = true;
    }
    if (dayOk) datesSucceeded += 1;
  }

  if (payload.length === 0) {
    return { inserted: 0, datesTried, datesSucceeded, warnings };
  }

  const { error } = await supabase
    .from("market_breadth_daily")
    .upsert(payload, { onConflict: "trade_date,market" });
  if (error) {
    throw new Error(`market_breadth_daily upsert failed: ${error.message}`);
  }

  return {
    inserted: payload.length,
    datesTried,
    datesSucceeded,
    warnings
  };
}

export async function syncMarketBreadthBackfill(lastDays = 180, targetMarket: MarketKind | "ALL" = "ALL"): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(
    supabase,
    "market_breadth_daily",
    targetMarket === "ALL" ? {} : { market: targetMarket }
  );
  if (!oldest) return syncMarketBreadthDaily(lastDays, targetMarket);

  return syncMarketBreadthForDates(buildOlderIsoDates(oldest, lastDays), targetMarket);
}

export async function syncMarketBreadthUpdate(lastDays = 180, targetMarket: MarketKind | "ALL" = "ALL"): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(
    supabase,
    "market_breadth_daily",
    targetMarket === "ALL" ? {} : { market: targetMarket }
  );
  if (!latest) return syncMarketBreadthDaily(lastDays, targetMarket);

  return syncMarketBreadthForDates(buildNewerIsoDates(latest, lastDays), targetMarket);
}

export async function syncMarketBreadthForDates(dates: string[], targetMarket: MarketKind | "ALL" = "ALL"): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: BreadthRow[] = [];

  let datesTried = 0;
  let datesSucceeded = 0;

  for (const dateIso of dates) {
    const trdDd = dateIso.replace(/[^\d]/g, "");
    if (trdDd.length !== 8) {
      warnings.push(`Invalid date format: ${dateIso}`);
      continue;
    }
    datesTried += 1;

    let dayOk = false;
    const markets = targetMarket === "ALL" ? (["KOSPI", "KOSDAQ"] as const) : ([targetMarket] as const);
    for (const market of markets) {
      const { rows, warning } = await ensureKrxStockDailyRows(trdDd, market);
      if (rows.length === 0) {
        warnings.push(`[${dateIso}] ${market} stock daily rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }
      if (warning) warnings.push(`[${dateIso}] ${market} ${warning}`);
      payload.push(aggregateBreadth(trdDd, market, rows));
      dayOk = true;
    }
    if (dayOk) datesSucceeded += 1;
  }

  if (payload.length === 0) {
    return { inserted: 0, datesTried, datesSucceeded, warnings };
  }

  const { error } = await supabase
    .from("market_breadth_daily")
    .upsert(payload, { onConflict: "trade_date,market" });
  if (error) {
    throw new Error(`market_breadth_daily upsert failed: ${error.message}`);
  }

  return {
    inserted: payload.length,
    datesTried,
    datesSucceeded,
    warnings
  };
}
