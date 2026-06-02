import "server-only";
import { getLatestTradeDate, getOldestTradeDate } from "@/lib/syncBackfill";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

interface SyncSummary {
  inserted: number;
  datesTried: number;
  datesSucceeded: number;
  warnings: string[];
}

type EcosRow = {
  TIME?: string;
  DATA_VALUE?: string;
  UNIT_NAME?: string;
};

const DEFAULT_BASE_URL = "https://ecos.bok.or.kr/api/StatisticSearch";
const M2_STAT_CODE = "161Y006";
const M2_ITEM_CODE = "BBHA00";

const getBaseUrl = () => (process.env.ECOS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

const getApiKey = () => {
  const key = process.env.ECOS_OPEN_API_KEY?.trim();
  if (!key) throw new Error("ECOS OpenAPI key is missing. Set ECOS_OPEN_API_KEY in .env.local.");
  return key;
};

const toMonthKey = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;

const toTradeDate = (yyyymm: string) => `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-01`;

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const monthCountFromDays = (lastDays: number) => Math.max(1, Math.ceil(Math.max(1, lastDays) / 31));

function recentMonthRange(lastDays: number) {
  const end = new Date();
  const months = monthCountFromDays(lastDays);
  const begin = addMonths(end, -(months - 1));
  return { beginMonth: toMonthKey(begin), endMonth: toMonthKey(end), months };
}

function olderMonthRange(oldestTradeDate: string, lastDays: number) {
  const months = monthCountFromDays(lastDays);
  const oldest = new Date(`${oldestTradeDate}T00:00:00+09:00`);
  const end = addMonths(oldest, -1);
  const begin = addMonths(end, -(months - 1));
  return { beginMonth: toMonthKey(begin), endMonth: toMonthKey(end), months };
}

function newerMonthRange(latestTradeDate: string, lastDays: number) {
  const months = monthCountFromDays(lastDays);
  const latest = new Date(`${latestTradeDate}T00:00:00+09:00`);
  const begin = addMonths(latest, 1);
  const plannedEnd = addMonths(begin, months - 1);
  const today = new Date();
  const end = plannedEnd > today ? today : plannedEnd;
  const datesTried = begin > end ? 0 : months;
  return { beginMonth: toMonthKey(begin), endMonth: toMonthKey(end), months: datesTried };
}

async function fetchEcosM2Rows(beginMonth: string, endMonth: string): Promise<EcosRow[]> {
  const apiKey = getApiKey();
  const url = `${getBaseUrl()}/${apiKey}/json/kr/1/1000/${M2_STAT_CODE}/M/${beginMonth}/${endMonth}/${M2_ITEM_CODE}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ECOS M2 request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json().catch(() => null)) as unknown;
  const root = json && typeof json === "object" ? (json as Record<string, unknown>).StatisticSearch : null;
  if (!root || typeof root !== "object") return [];
  const rows = (root as Record<string, unknown>).row;
  return Array.isArray(rows) ? rows.filter((row): row is EcosRow => Boolean(row) && typeof row === "object") : [];
}

async function syncEcosM2Range(beginMonth: string, endMonth: string, datesTried: number): Promise<SyncSummary> {
  const rows = await fetchEcosM2Rows(beginMonth, endMonth);
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const payload = rows
    .map((row) => {
      const sourceTime = String(row.TIME ?? "").replace(/[^\d]/g, "");
      const m2BillionKrw = parseNumber(row.DATA_VALUE);
      if (sourceTime.length !== 6 || m2BillionKrw === null) return null;
      return {
        trade_date: toTradeDate(sourceTime),
        source_time: sourceTime,
        m2_billion_krw: m2BillionKrw,
        unit_name: row.UNIT_NAME ?? "십억원",
        stat_code: M2_STAT_CODE,
        item_code: M2_ITEM_CODE,
        created_at: now,
        updated_at: now
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (payload.length === 0) {
    warnings.push("ECOS M2 returned no valid rows.");
    return { inserted: 0, datesTried, datesSucceeded: 0, warnings };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("market_m2_monthly").upsert(payload, { onConflict: "trade_date" });
  if (error) throw new Error(`market_m2_monthly upsert failed: ${error.message}`);

  return { inserted: payload.length, datesTried, datesSucceeded: payload.length, warnings };
}

export async function syncEcosM2Monthly(lastDays = 180): Promise<SyncSummary> {
  const { beginMonth, endMonth, months } = recentMonthRange(lastDays);
  return syncEcosM2Range(beginMonth, endMonth, months);
}

export async function syncEcosM2Backfill(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const oldest = await getOldestTradeDate(supabase, "market_m2_monthly");
  if (!oldest) return syncEcosM2Monthly(lastDays);
  const { beginMonth, endMonth, months } = olderMonthRange(oldest, lastDays);
  return syncEcosM2Range(beginMonth, endMonth, months);
}

export async function syncEcosM2Update(lastDays = 180): Promise<SyncSummary> {
  const supabase = getSupabaseAdmin();
  const latest = await getLatestTradeDate(supabase, "market_m2_monthly");
  if (!latest) return syncEcosM2Monthly(lastDays);
  const { beginMonth, endMonth, months } = newerMonthRange(latest, lastDays);
  if (months === 0) return { inserted: 0, datesTried: 0, datesSucceeded: 0, warnings: ["No newer M2 month to request."] };
  return syncEcosM2Range(beginMonth, endMonth, months);
}
