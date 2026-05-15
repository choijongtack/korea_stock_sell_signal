import type { RiskLevel } from "@/types/risk";

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

export const sortByDateAsc = <T extends { tradeDate: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

export const uniqSortedDates = (dates: string[]): string[] => Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b));

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 85) return "crisis";
  if (score >= 60) return "danger";
  if (score >= 40) return "warning";
  if (score >= 20) return "caution";
  return "stable";
}

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function pctDrawdownFromHigh(current: number | null, high: number | null): number | null {
  if (current === null || high === null || high === 0) return null;
  return ((high - current) / high) * 100;
}

export function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

export function maxValue(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}
