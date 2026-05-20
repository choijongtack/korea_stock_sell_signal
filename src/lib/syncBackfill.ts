import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DateRange = {
  beginYmd: string;
  endYmd: string;
  datesTried: number;
};

export const toYmd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

export const toIsoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

export function buildRecentDateRange(lastDays: number, lookbackBufferDays = 0): DateRange {
  const end = new Date();
  const begin = new Date();
  begin.setDate(begin.getDate() - Math.max(0, lastDays - 1 + lookbackBufferDays));
  return {
    beginYmd: toYmd(begin),
    endYmd: toYmd(end),
    datesTried: lastDays
  };
}

export function buildOlderDateRange(oldestTradeDate: string, lastDays: number, lookbackBufferDays = 0): DateRange {
  const end = new Date(`${oldestTradeDate}T00:00:00+09:00`);
  end.setDate(end.getDate() - 1);

  const begin = new Date(end);
  begin.setDate(begin.getDate() - Math.max(0, lastDays - 1 + lookbackBufferDays));

  return {
    beginYmd: toYmd(begin),
    endYmd: toYmd(end),
    datesTried: lastDays
  };
}

export function buildOlderIsoDates(oldestTradeDate: string, lastDays: number): string[] {
  const end = new Date(`${oldestTradeDate}T00:00:00+09:00`);
  end.setDate(end.getDate() - 1);

  const dates: string[] = [];
  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(toIsoDate(toYmd(d)));
  }
  return dates;
}

export function buildNewerDateRange(latestTradeDate: string, lastDays: number, lookaheadBufferDays = 0): DateRange {
  const begin = new Date(`${latestTradeDate}T00:00:00+09:00`);
  begin.setDate(begin.getDate() + 1);

  const end = new Date(begin);
  end.setDate(end.getDate() + Math.max(0, lastDays - 1 + lookaheadBufferDays));

  const today = new Date();
  const cappedEnd = end > today ? today : end;
  if (begin > cappedEnd) {
    return {
      beginYmd: toYmd(begin),
      endYmd: toYmd(cappedEnd),
      datesTried: 0
    };
  }

  const spanDays = Math.floor((cappedEnd.getTime() - begin.getTime()) / 86_400_000) + 1;
  return {
    beginYmd: toYmd(begin),
    endYmd: toYmd(cappedEnd),
    datesTried: Math.max(0, Math.min(lastDays, spanDays))
  };
}

export function buildNewerIsoDates(latestTradeDate: string, lastDays: number): string[] {
  const begin = new Date(`${latestTradeDate}T00:00:00+09:00`);
  begin.setDate(begin.getDate() + 1);

  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < lastDays; i += 1) {
    const d = new Date(begin);
    d.setDate(d.getDate() + i);
    if (d > today) break;
    dates.push(toIsoDate(toYmd(d)));
  }
  return dates;
}

export async function getOldestTradeDate(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string> = {}
): Promise<string | null> {
  let query = supabase.from(table).select("trade_date").order("trade_date", { ascending: true }).limit(1);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { data, error } = await query;
  if (error) throw new Error(`${table} oldest date lookup failed: ${error.message}`);

  return data?.[0]?.trade_date ?? null;
}

export async function getLatestTradeDate(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string> = {}
): Promise<string | null> {
  let query = supabase.from(table).select("trade_date").order("trade_date", { ascending: false }).limit(1);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { data, error } = await query;
  if (error) throw new Error(`${table} latest date lookup failed: ${error.message}`);

  return data?.[0]?.trade_date ?? null;
}
