import "server-only";
import { buildNewerDateRange, buildOlderDateRange, buildRecentDateRange, getLatestTradeDate, getOldestTradeDate } from "@/lib/syncBackfill";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SyncType = "kofia_liquidity" | "kofia_credit_balance" | "kofia_cma";

interface SyncSummary {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

type KofiaItem = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService";
const getBaseUrl = () => (process.env.KOFIA_OPENAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const getEncodedServiceKey = () => {
  const encoded = process.env.KOFIA_OPENAPI_SERVICE_KEY_ENCODED?.trim();
  if (encoded) return encoded;

  const raw = process.env.KOFIA_OPENAPI_SERVICE_KEY?.trim() || process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  return raw ? encodeURIComponent(raw) : "";
};

const ENDPOINTS: Record<SyncType, string> = {
  kofia_liquidity: "getSecuritiesMarketTotalCapitalInfo",
  kofia_credit_balance: "getGrantingOfCreditBalanceInfo",
  kofia_cma: "getCMAStatus"
};

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function krwToMillion(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : n / 1_000_000;
}

function compactDate(value: unknown): string | null {
  const raw = String(value ?? "").replace(/[^\d]/g, "");
  return raw.length === 8 ? raw : null;
}

function extractItems(json: unknown): KofiaItem[] {
  if (!json || typeof json !== "object") return [];
  const response = (json as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return [];
  const body = (response as Record<string, unknown>).body;
  if (!body || typeof body !== "object") return [];
  const items = (body as Record<string, unknown>).items;
  if (!items || typeof items !== "object") return [];
  const item = (items as Record<string, unknown>).item;
  if (Array.isArray(item)) return item.filter((v): v is KofiaItem => Boolean(v) && typeof v === "object");
  return item && typeof item === "object" ? [item as KofiaItem] : [];
}

function extractTotalCount(json: unknown): number {
  if (!json || typeof json !== "object") return 0;
  const response = (json as Record<string, unknown>).response;
  const body = response && typeof response === "object" ? (response as Record<string, unknown>).body : null;
  return toNumber(body && typeof body === "object" ? (body as Record<string, unknown>).totalCount : null) ?? 0;
}

async function fetchKofiaItems(endpoint: string, beginBasDt: string, endBasDt: string): Promise<KofiaItem[]> {
  const serviceKey = getEncodedServiceKey();
  if (!serviceKey) {
    throw new Error("KOFIA OpenAPI service key is missing. Set KOFIA_OPENAPI_SERVICE_KEY_ENCODED or KOFIA_OPENAPI_SERVICE_KEY in .env.local.");
  }

  const base = getBaseUrl();
  const allItems: KofiaItem[] = [];
  const numOfRows = 1000;
  let pageNo = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (allItems.length < totalCount) {
    const params = new URLSearchParams({
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      resultType: "json",
      beginBasDt,
      endBasDt
    });
    const url = `${base}/${endpoint}?serviceKey=${serviceKey}&${params.toString()}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`KOFIA OpenAPI request failed (${endpoint}, ${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json().catch(() => null)) as unknown;
    const items = extractItems(json);
    if (pageNo === 1) totalCount = extractTotalCount(json);
    if (items.length === 0) break;

    allItems.push(...items);
    pageNo += 1;
  }

  return allItems;
}

function countDistinctDates(rows: Array<{ trade_date: string }>): number {
  return new Set(rows.map((row) => row.trade_date)).size;
}

async function syncKofiaMarketLiquidityRange(beginBasDt: string, endBasDt: string, datesTried: number): Promise<SyncSummary> {
  const items = await fetchKofiaItems(ENDPOINTS.kofia_liquidity, beginBasDt, endBasDt);
  const warnings: string[] = [];

  const payload = items
    .map((item) => {
      const basDt = compactDate(item.basDt);
      if (!basDt) return null;
      return {
        trade_date: toIsoDate(basDt),
        investor_deposit_million_krw: krwToMillion(item.invrDpsgAmt),
        derivatives_deposit_million_krw: krwToMillion(item.onbdDrvPrdTrRcAdvAmt),
        rp_balance_million_krw: krwToMillion(item.toCstRpchCndBndSlgBal),
        unsettled_balance_million_krw: krwToMillion(item.brkTrdUcolMny),
        created_at: new Date().toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (payload.length === 0) {
    warnings.push("KOFIA market liquidity returned no valid rows.");
    return { inserted: 0, datesTried, datesSucceeded: 0, warnings };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("market_liquidity_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) throw new Error(`market_liquidity_daily upsert failed: ${error.message}`);

  return { inserted: payload.length, datesTried, datesSucceeded: countDistinctDates(payload), warnings };
}

export async function syncKofiaMarketLiquidityDaily(lastDays = 180): Promise<SyncSummary> {
  const { beginYmd, endYmd, datesTried } = buildRecentDateRange(lastDays);
  return syncKofiaMarketLiquidityRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaMarketLiquidityBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_liquidity_daily");
  if (!oldest) return syncKofiaMarketLiquidityDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildOlderDateRange(oldest, lastDays);
  return syncKofiaMarketLiquidityRange(beginYmd, endYmd, datesTried);
}

async function syncKofiaCreditBalanceRange(beginBasDt: string, endBasDt: string, datesTried: number): Promise<SyncSummary> {
  const items = await fetchKofiaItems(ENDPOINTS.kofia_credit_balance, beginBasDt, endBasDt);
  const warnings: string[] = [];

  const payload = items
    .map((item) => {
      const basDt = compactDate(item.basDt);
      if (!basDt) return null;
      const creditLoan = krwToMillion(item.crdTrFingWhl);
      const creditShort = krwToMillion(item.crdTrLndrWhl);
      const collateral = krwToMillion(item.dpsgScrtMogFing);
      const allNumbers = [creditLoan, creditShort, collateral].every((v) => typeof v === "number");
      return {
        trade_date: toIsoDate(basDt),
        credit_loan_million_krw: creditLoan,
        credit_short_million_krw: creditShort,
        collateral_loan_million_krw: collateral,
        total_credit_million_krw: allNumbers ? (creditLoan as number) + (creditShort as number) + (collateral as number) : null,
        created_at: new Date().toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (payload.length === 0) {
    warnings.push("KOFIA credit balance returned no valid rows.");
    return { inserted: 0, datesTried, datesSucceeded: 0, warnings };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("market_credit_balance_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) throw new Error(`market_credit_balance_daily upsert failed: ${error.message}`);

  return { inserted: payload.length, datesTried, datesSucceeded: countDistinctDates(payload), warnings };
}

export async function syncKofiaCreditBalanceDaily(lastDays = 180): Promise<SyncSummary> {
  const { beginYmd, endYmd, datesTried } = buildRecentDateRange(lastDays);
  return syncKofiaCreditBalanceRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaCreditBalanceBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_credit_balance_daily");
  if (!oldest) return syncKofiaCreditBalanceDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildOlderDateRange(oldest, lastDays);
  return syncKofiaCreditBalanceRange(beginYmd, endYmd, datesTried);
}

function isTotalInvestorCategory(value: unknown): boolean {
  const raw = String(value ?? "").replace(/\s/g, "");
  return raw.includes("합계") || raw.toUpperCase() === "TOTAL";
}

function cmaBucket(value: unknown): "rp" | "mmf" | "jonggeum" | "issuingNote" | "other" | "total" {
  const raw = String(value ?? "").replace(/\s/g, "").toUpperCase();
  if (raw.includes("합계") || raw === "TOTAL") return "total";
  if (raw.includes("RP")) return "rp";
  if (raw.includes("MMF")) return "mmf";
  if (raw.includes("종금")) return "jonggeum";
  if (raw.includes("발행어음")) return "issuingNote";
  return "other";
}

async function syncKofiaCmaRange(beginBasDt: string, endBasDt: string, datesTried: number): Promise<SyncSummary> {
  const items = await fetchKofiaItems(ENDPOINTS.kofia_cma, beginBasDt, endBasDt);
  const warnings: string[] = [];
  const hasTotalCategoryByDate = new Map<string, boolean>();

  for (const item of items) {
    const basDt = compactDate(item.basDt);
    if (!basDt) continue;
    if (isTotalInvestorCategory(item.invrCtg)) hasTotalCategoryByDate.set(basDt, true);
  }

  const byDate = new Map<
    string,
    {
      rp_type_million_krw: number;
      mmf_type_million_krw: number;
      jonggeum_type_million_krw: number;
      issuing_note_type_million_krw: number;
      other_type_million_krw: number;
      total_million_krw: number | null;
    }
  >();

  for (const item of items) {
    const basDt = compactDate(item.basDt);
    if (!basDt) continue;

    const shouldUseRow = hasTotalCategoryByDate.get(basDt) ? isTotalInvestorCategory(item.invrCtg) : true;
    if (!shouldUseRow) continue;

    const row = byDate.get(basDt) ?? {
      rp_type_million_krw: 0,
      mmf_type_million_krw: 0,
      jonggeum_type_million_krw: 0,
      issuing_note_type_million_krw: 0,
      other_type_million_krw: 0,
      total_million_krw: null
    };
    const amount = krwToMillion(item.actBal) ?? 0;

    switch (cmaBucket(item.mngInvTgt)) {
      case "rp":
        row.rp_type_million_krw += amount;
        break;
      case "mmf":
        row.mmf_type_million_krw += amount;
        break;
      case "jonggeum":
        row.jonggeum_type_million_krw += amount;
        break;
      case "issuingNote":
        row.issuing_note_type_million_krw += amount;
        break;
      case "total":
        row.total_million_krw = amount;
        break;
      case "other":
        row.other_type_million_krw += amount;
        break;
    }

    byDate.set(basDt, row);
  }

  const payload = Array.from(byDate.entries()).map(([basDt, row]) => {
    const fallbackTotal =
      row.rp_type_million_krw +
      row.mmf_type_million_krw +
      row.jonggeum_type_million_krw +
      row.issuing_note_type_million_krw +
      row.other_type_million_krw;
    return {
      trade_date: toIsoDate(basDt),
      ...row,
      total_million_krw: row.total_million_krw ?? fallbackTotal,
      created_at: new Date().toISOString()
    };
  });

  if (payload.length === 0) {
    warnings.push("KOFIA CMA returned no valid rows.");
    return { inserted: 0, datesTried, datesSucceeded: 0, warnings };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("market_cma_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) throw new Error(`market_cma_daily upsert failed: ${error.message}`);

  return { inserted: payload.length, datesTried, datesSucceeded: countDistinctDates(payload), warnings };
}

export async function syncKofiaCmaDaily(lastDays = 180): Promise<SyncSummary> {
  const { beginYmd, endYmd, datesTried } = buildRecentDateRange(lastDays);
  return syncKofiaCmaRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaCmaBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_cma_daily");
  if (!oldest) return syncKofiaCmaDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildOlderDateRange(oldest, lastDays);
  return syncKofiaCmaRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaMarketLiquidityUpdate(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_liquidity_daily");
  if (!latest) return syncKofiaMarketLiquidityDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildNewerDateRange(latest, lastDays);
  return syncKofiaMarketLiquidityRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaCreditBalanceUpdate(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_credit_balance_daily");
  if (!latest) return syncKofiaCreditBalanceDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildNewerDateRange(latest, lastDays);
  return syncKofiaCreditBalanceRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaCmaUpdate(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_cma_daily");
  if (!latest) return syncKofiaCmaDaily(lastDays);
  const { beginYmd, endYmd, datesTried } = buildNewerDateRange(latest, lastDays);
  return syncKofiaCmaRange(beginYmd, endYmd, datesTried);
}

export async function syncKofiaAll(lastDays = 180): Promise<SyncSummary> {
  const results = await Promise.all([
    syncKofiaMarketLiquidityDaily(lastDays),
    syncKofiaCreditBalanceDaily(lastDays),
    syncKofiaCmaDaily(lastDays)
  ]);

  return {
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    datesTried: lastDays,
    datesSucceeded: Math.max(...results.map((result) => result.datesSucceeded)),
    warnings: results.flatMap((result) => result.warnings)
  };
}

export async function syncKofiaAllBackfill(lastDays = 180): Promise<SyncSummary> {
  const results = await Promise.all([
    syncKofiaMarketLiquidityBackfill(lastDays),
    syncKofiaCreditBalanceBackfill(lastDays),
    syncKofiaCmaBackfill(lastDays)
  ]);

  return {
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    datesTried: lastDays,
    datesSucceeded: Math.max(...results.map((result) => result.datesSucceeded)),
    warnings: results.flatMap((result) => result.warnings)
  };
}
