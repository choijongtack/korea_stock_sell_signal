import type { MarketIndexDaily } from "@/types/market";
import { avg, sortByDateAsc } from "@/lib/riskUtils";

export interface MarketIndexDailyWithMa extends MarketIndexDaily {
  ma20: number | null;
  ma60: number | null;
}

function movingAverage(values: Array<number | null>, window: number, index: number): number | null {
  if (index < window - 1) return null;
  const slice = values.slice(index - window + 1, index + 1);
  if (slice.some((v) => typeof v !== "number")) return null;
  return avg(slice as number[]);
}

export function calculateMovingAverages(rows: MarketIndexDaily[]): MarketIndexDailyWithMa[] {
  const grouped = new Map<string, MarketIndexDaily[]>();
  for (const row of rows) {
    const list = grouped.get(row.market) ?? [];
    list.push(row);
    grouped.set(row.market, list);
  }

  const result: MarketIndexDailyWithMa[] = [];
  for (const [, marketRows] of grouped) {
    const sorted = sortByDateAsc(marketRows);
    const closes = sorted.map((row) => row.close);
    sorted.forEach((row, index) => {
      result.push({
        ...row,
        ma20: movingAverage(closes, 20, index),
        ma60: movingAverage(closes, 60, index)
      });
    });
  }

  return sortByDateAsc(result);
}

export function getKospiMovingAverages(indexRows: MarketIndexDaily[], tradeDate: string): { ma20: number | null; ma60: number | null; current: number | null } {
  const kospiRows = sortByDateAsc(indexRows).filter((row) => row.market === "KOSPI" && row.tradeDate <= tradeDate);
  const closes = kospiRows.map((row) => row.close);
  const current = kospiRows.at(-1)?.close ?? null;
  return {
    ma20: movingAverage(closes, 20, closes.length - 1),
    ma60: movingAverage(closes, 60, closes.length - 1),
    current: typeof current === "number" ? current : null
  };
}
