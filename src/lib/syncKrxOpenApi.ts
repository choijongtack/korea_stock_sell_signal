import "server-only";
import { buildNewerIsoDates, buildOlderIsoDates, getLatestTradeDate, getOldestTradeDate } from "@/lib/syncBackfill";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureKrxStockDailyRows } from "@/lib/syncKrxStockDaily";

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

interface KrxRowsResult {
  rows: Record<string, unknown>[];
  warning?: string;
}

const getBaseUrl = () => (process.env.KRX_OPENAPI_BASE_URL ?? "").replace(/\/+$/, "");
const getAuthKey = () => process.env.KRX_OPENAPI_AUTH_KEY ?? "";
const getAuthKeyKospi = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSPI ?? "";
const getAuthKeyKosdaq = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSDAQ ?? "";

const getIndexApiIdKospi = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI ?? "";
const getIndexApiIdKosdaq = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSDAQ ?? "";
const getIndexApiIdKospi200 = () => process.env.KRX_OPENAPI_INDEX_API_ID_KOSPI200 ?? "";

const toYmd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toIso = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const isWeekendYmd = (yyyymmdd: string) => {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00+09:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
};
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


async function fetchRows(apiId: string, market: Market, basDd: string, apiGroup: "sto" | "idx" = "sto"): Promise<KrxRowsResult> {
  const base = getBaseUrl();
  const key = authKeyFor(market);
  if (!base) return { rows: [], warning: "KRX_OPENAPI_BASE_URL is missing." };
  if (!key) return { rows: [], warning: `${market} KRX auth key is missing.` };
  if (!apiId) return { rows: [], warning: `${market} KRX API ID is missing.` };

  const candidates = [
    { method: "POST", url: `${base}/svc/apis/${apiGroup}/${apiId}` },
    { method: "POST", url: `${base}/svc/sample/apis/${apiGroup}/${apiId}` },
    { method: "GET", url: `${base}/svc/apis/${apiGroup}/${apiId}?basDd=${basDd}` },
    { method: "GET", url: `${base}/svc/sample/apis/${apiGroup}/${apiId}?basDd=${basDd}` }
  ] as const;
  const failures: string[] = [];

  for (const candidate of candidates) {
    const res = await fetch(candidate.url, {
      method: candidate.method,
      headers:
        candidate.method === "POST"
          ? { AUTH_KEY: key, "Content-Type": "application/json", Accept: "application/json" }
          : { AUTH_KEY: key, Accept: "application/json" },
      body: candidate.method === "POST" ? JSON.stringify({ basDd }) : undefined,
      cache: "no-store"
    });
    if (!res.ok) {
      failures.push(`${candidate.method} ${new URL(candidate.url).pathname} ${res.status}`);
      continue;
    }
    const json = (await res.json().catch(() => null)) as { OutBlock_1?: Record<string, unknown>[] } | null;
    const rows = json?.OutBlock_1 ?? [];
    if (rows.length > 0) return { rows };
    failures.push(`${candidate.method} ${new URL(candidate.url).pathname} empty`);
  }

  return { rows: [], warning: failures.join(" ; ") };
}

async function fetchIndexRowsFast(apiId: string, market: Market, basDd: string): Promise<KrxRowsResult> {
  const base = getBaseUrl();
  const key = authKeyFor(market);
  if (!base) return { rows: [], warning: "KRX_OPENAPI_BASE_URL is missing." };
  if (!key) return { rows: [], warning: `${market} KRX auth key is missing.` };
  if (!apiId) return { rows: [], warning: `${market} KRX API ID is missing.` };

  const url = `${base}/svc/apis/idx/${apiId}?basDd=${basDd}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { AUTH_KEY: key, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) return { rows: [], warning: `GET ${new URL(url).pathname} ${res.status}` };

    const json = (await res.json().catch(() => null)) as { OutBlock_1?: Record<string, unknown>[] } | null;
    return { rows: json?.OutBlock_1 ?? [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return { rows: [], warning: `GET ${new URL(url).pathname} ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIndexName(value: unknown): string {
  return String(value ?? "").replace(/\s/g, "").toUpperCase();
}

function findIndexRow(rows: Record<string, unknown>[], market: Market): Record<string, unknown> | null {
  const wanted: Record<Market, string[]> = {
    KOSPI: ["KOSPI", "코스피"],
    KOSDAQ: ["KOSDAQ", "코스닥"],
    KOSPI200: ["KOSPI200", "코스피200", "코스피 200"]
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

function findMarketCapIndexRow(rows: Record<string, unknown>[], market: "KOSPI" | "KOSDAQ"): Record<string, unknown> | null {
  const marketRows = rows.filter((row) => String(row.IDX_CLSS ?? "").replace(/\s/g, "").toUpperCase() === market);
  return (
    marketRows.find((row) => num(row.CLSPRC_IDX) !== null && num(row.MKTCAP) !== null) ??
    marketRows.find((row) => num(row.MKTCAP) !== null) ??
    rows.find((row) => num(row.MKTCAP) !== null) ??
    null
  );
}

function mapIndexRowToMarketCap(row: Record<string, unknown>, market: "KOSPI" | "KOSDAQ", ymd: string): MarketCapRow | null {
  const marketCapKrw = num(row.MKTCAP);
  if (marketCapKrw === null || marketCapKrw <= 0) return null;

  const now = new Date().toISOString();
  return {
    trade_date: toIso(ymd),
    market,
    market_cap_million_krw: marketCapKrw / 1_000_000,
    listed_stock_count: 0,
    created_at: now,
    updated_at: now
  };
}

function hasActionableFetchWarning(warnings: string[]) {
  return warnings.some((warning) =>
    /(?:\b40[13]\b|\b5\d{2}\b|auth key|API ID|BASE_URL|request failed|aborted|timeout|ECONN|ENOTFOUND)/i.test(warning)
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
    if (isWeekendYmd(ymd)) continue;
    datesTried += 1;
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ", "KOSPI200"] as const) {
      const apiId = apiIdForIndex(market);
      if (!apiId) continue;
      const { rows, warning } = await fetchRows(apiId, market, ymd, "idx");
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} index rows not found.${warning ? ` ${warning}` : ""}`);
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

export async function syncKrxIndexBackfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_index_daily");
  if (!oldest) return syncKrxIndexDaily(lastDays);

  const warnings: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  let datesSucceeded = 0;
  let datesTried = 0;
  const dates = buildOlderIsoDates(oldest, lastDays);

  for (const dateIso of dates) {
    const ymd = dateIso.replace(/[^\d]/g, "");
    if (isWeekendYmd(ymd)) continue;
    datesTried += 1;
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ", "KOSPI200"] as const) {
      const apiId = apiIdForIndex(market);
      if (!apiId) continue;
      const { rows, warning } = await fetchRows(apiId, market, ymd, "idx");
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} index rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }

      const candidate = findIndexRow(rows, market);
      const mapped = candidate ? mapIndexRowToDaily(candidate, market, ymd) : null;
      if (!mapped) {
        warnings.push(`[${ymd}] ${market} index row mapping failed. apiId=${apiId}`);
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

export async function syncKrxIndexUpdate(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_index_daily");
  if (!latest) return syncKrxIndexDaily(lastDays);

  const warnings: string[] = [];
  const payload: Array<Record<string, unknown>> = [];
  let datesSucceeded = 0;
  let datesTried = 0;
  const dates = buildNewerIsoDates(latest, lastDays);

  for (const dateIso of dates) {
    const ymd = dateIso.replace(/[^\d]/g, "");
    if (isWeekendYmd(ymd)) continue;
    datesTried += 1;
    let dayOk = false;

    for (const market of ["KOSPI", "KOSDAQ", "KOSPI200"] as const) {
      const apiId = apiIdForIndex(market);
      if (!apiId) continue;
      const { rows, warning } = await fetchRows(apiId, market, ymd, "idx");
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} index rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }

      const candidate = findIndexRow(rows, market);
      const mapped = candidate ? mapIndexRowToDaily(candidate, market, ymd) : null;
      if (!mapped) {
        warnings.push(`[${ymd}] ${market} index row mapping failed. apiId=${apiId}`);
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
      const { rows, warning } = await ensureKrxStockDailyRows(ymd, market);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} stocks rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }

      rowsForDay.push(...rows);
      dayOk = true;
    }

    if (rowsForDay.length > 0) {
      inserted += rowsForDay.length;
    }

    if (dayOk) {
      datesSucceeded += 1;
      await syncKrxMarketCapForDates([toIso(ymd)]);
    }
  }

  return { inserted, datesTried, datesSucceeded, warnings };
}

export async function syncKrxStocksBackfill(lastDays = 200): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_cap_daily");
  if (!oldest) return syncKrxStocksDaily(lastDays);

  const warnings: string[] = [];
  let inserted = 0;
  let datesSucceeded = 0;
  const dates = buildOlderIsoDates(oldest, lastDays);

  for (const dateIso of dates) {
    const ymd = dateIso.replace(/[^\d]/g, "");
    let dayOk = false;
    const rowsForDay: Record<string, unknown>[] = [];

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const { rows, warning } = await ensureKrxStockDailyRows(ymd, market);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} stocks rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }

      rowsForDay.push(...rows);
      dayOk = true;
    }

    if (rowsForDay.length > 0) inserted += rowsForDay.length;
    if (dayOk) {
      datesSucceeded += 1;
      await syncKrxMarketCapForDates([dateIso]);
    }
  }

  return { inserted, datesTried: dates.length, datesSucceeded, warnings };
}

export async function syncKrxStocksUpdate(lastDays = 200): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_cap_daily");
  if (!latest) return syncKrxStocksDaily(lastDays);

  const warnings: string[] = [];
  let inserted = 0;
  let datesSucceeded = 0;
  const dates = buildNewerIsoDates(latest, lastDays);

  for (const dateIso of dates) {
    const ymd = dateIso.replace(/[^\d]/g, "");
    let dayOk = false;
    const rowsForDay: Record<string, unknown>[] = [];

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const { rows, warning } = await ensureKrxStockDailyRows(ymd, market);
      if (rows.length === 0) {
        warnings.push(`[${ymd}] ${market} stocks rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }

      rowsForDay.push(...rows);
      dayOk = true;
    }

    if (rowsForDay.length > 0) inserted += rowsForDay.length;
    if (dayOk) {
      datesSucceeded += 1;
      await syncKrxMarketCapForDates([dateIso]);
    }
  }

  return { inserted, datesTried: dates.length, datesSucceeded, warnings };
}

export async function syncKrxMarketCapDaily(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: MarketCapRow[] = [];
  let datesTried = 0;
  let datesSucceeded = 0;
  let hasFoundAnyAvailableDate = false;

  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = toYmd(d);
    datesTried += 1;
    if (isWeekendYmd(ymd)) continue;
    const dayPayload: MarketCapRow[] = [];
    const dayWarnings: string[] = [];

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const apiId = apiIdForIndex(market);
      const { rows, warning } = await fetchIndexRowsFast(apiId, market, ymd);
      if (rows.length === 0) {
        dayWarnings.push(`[${ymd}] ${market} index market cap rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }
      if (warning) dayWarnings.push(`[${ymd}] ${market} ${warning}`);

      const candidate = findMarketCapIndexRow(rows, market);
      const mapped = candidate ? mapIndexRowToMarketCap(candidate, market, ymd) : null;
      if (!mapped) {
        dayWarnings.push(`[${ymd}] ${market} index market cap mapping failed.`);
        continue;
      }

      dayPayload.push(mapped);
    }

    if (dayPayload.length > 0) {
      payload.push(...dayPayload);
      hasFoundAnyAvailableDate = true;
      datesSucceeded += 1;
      if (dayPayload.length < 2) warnings.push(...dayWarnings);
    } else if (hasActionableFetchWarning(dayWarnings)) {
      warnings.push(...dayWarnings);
    } else if (hasFoundAnyAvailableDate) {
      // Both KOSPI and KOSDAQ are empty on some weekday holidays. Treat those as non-trading days.
      continue;
    }
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("market_cap_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`market_cap_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded, warnings };
}

export async function syncKrxMarketCapForDates(dates: string[]): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const payload: MarketCapRow[] = [];
  let datesTried = 0;
  let datesSucceeded = 0;

  for (const dateIso of dates) {
    const ymd = dateIso.replace(/[^\d]/g, "");
    if (ymd.length !== 8) {
      warnings.push(`Invalid date format: ${dateIso}`);
      continue;
    }
    datesTried += 1;
    if (isWeekendYmd(ymd)) continue;
    const dayPayload: MarketCapRow[] = [];
    const dayWarnings: string[] = [];

    for (const market of ["KOSPI", "KOSDAQ"] as const) {
      const apiId = apiIdForIndex(market);
      const { rows, warning } = await fetchIndexRowsFast(apiId, market, ymd);
      if (rows.length === 0) {
        dayWarnings.push(`[${dateIso}] ${market} index market cap rows not found.${warning ? ` ${warning}` : ""}`);
        continue;
      }
      if (warning) dayWarnings.push(`[${dateIso}] ${market} ${warning}`);

      const candidate = findMarketCapIndexRow(rows, market);
      const mapped = candidate ? mapIndexRowToMarketCap(candidate, market, ymd) : null;
      if (!mapped) {
        dayWarnings.push(`[${dateIso}] ${market} index market cap mapping failed.`);
        continue;
      }

      dayPayload.push(mapped);
    }

    if (dayPayload.length > 0) {
      payload.push(...dayPayload);
      datesSucceeded += 1;
      if (dayPayload.length < 2) warnings.push(...dayWarnings);
    } else if (hasActionableFetchWarning(dayWarnings)) {
      warnings.push(...dayWarnings);
    }
  }

  if (payload.length > 0) {
    const { error } = await supabase.from("market_cap_daily").upsert(payload, { onConflict: "trade_date,market" });
    if (error) throw new Error(`market_cap_daily upsert failed: ${error.message}`);
  }

  return { inserted: payload.length, datesTried, datesSucceeded, warnings };
}

export async function syncKrxMarketCapBackfill(lastDays = 200): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_cap_daily");
  if (!oldest) return syncKrxMarketCapDaily(lastDays);
  const dates = buildOlderIsoDates(oldest, lastDays);
  return syncKrxMarketCapForDates(dates);
}

export async function syncKrxMarketCapUpdate(lastDays = 200): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_cap_daily");
  if (!latest) return syncKrxMarketCapDaily(lastDays);
  const dates = buildNewerIsoDates(latest, lastDays);
  return syncKrxMarketCapForDates(dates);
}

