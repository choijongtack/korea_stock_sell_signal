import type { MarketIndexDaily } from "@/types/market";

type RawRow = Record<string, any>;
type IndexField = Exclude<keyof MarketIndexDaily, "createdAt">;

const krxIndexColumnMap: Record<string, IndexField> = {
  "기준일": "tradeDate",
  "일자": "tradeDate",
  "날짜": "tradeDate",
  "시장명": "market",
  "지수명": "market",
  "종가": "close",
  "현재가": "close",
  "대비": "change",
  "등락": "change",
  "등락률": "changeRate",
  "등락률퍼센트": "changeRate",
  "시가": "open",
  "고가": "high",
  "저가": "low",
  "거래량": "volume",
  "거래대금": "tradingValueMillionKrw"
};

interface NormalizeOptions {
  createdAt?: string;
}

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const normalizeMarketName = (value: any): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;

  if (raw.includes("코스피200") || raw.includes("KOSPI200")) return "KOSPI200";
  if (raw.includes("코스닥") || raw.includes("KOSDAQ")) return "KOSDAQ";
  if (raw.includes("코스피") || raw.includes("KOSPI")) return "KOSPI";
  return raw;
};

const toDateString = (value: any): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d]/g, "");
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

  const parsed = new Date(raw.replace(/[./]/g, "-"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const toNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRateNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().replace(/,/g, "").replace(/%/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const readMappedValue = (row: RawRow, headerMap: Map<IndexField, string>, field: IndexField): any => {
  const header = headerMap.get(field);
  return header ? row[header] : null;
};

export function normalizeKrxIndex(rows: RawRow[], options: NormalizeOptions = {}): MarketIndexDaily[] {
  const createdAt = options.createdAt ?? "1970-01-01T00:00:00.000Z";

  const allHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => allHeaders.add(key)));
  const normalizedHeaderToOriginal = new Map<string, string>();
  allHeaders.forEach((header) => normalizedHeaderToOriginal.set(normalizeHeader(header), header));

  const headerMap = new Map<IndexField, string>();
  Object.entries(krxIndexColumnMap).forEach(([sourceHeader, targetField]) => {
    const resolved = normalizedHeaderToOriginal.get(normalizeHeader(sourceHeader));
    if (resolved && !headerMap.has(targetField)) headerMap.set(targetField, resolved);
  });

  return rows
    .map((row): MarketIndexDaily | null => {
      const tradeDate = toDateString(readMappedValue(row, headerMap, "tradeDate"));
      if (!tradeDate) return null;

      return {
        tradeDate,
        market: normalizeMarketName(readMappedValue(row, headerMap, "market")) ?? "UNKNOWN",
        close: toNumberOrNull(readMappedValue(row, headerMap, "close")),
        change: toNumberOrNull(readMappedValue(row, headerMap, "change")),
        changeRate: toRateNumberOrNull(readMappedValue(row, headerMap, "changeRate")),
        open: toNumberOrNull(readMappedValue(row, headerMap, "open")),
        high: toNumberOrNull(readMappedValue(row, headerMap, "high")),
        low: toNumberOrNull(readMappedValue(row, headerMap, "low")),
        volume: toNumberOrNull(readMappedValue(row, headerMap, "volume")),
        tradingValueMillionKrw: toNumberOrNull(readMappedValue(row, headerMap, "tradingValueMillionKrw")),
        createdAt
      };
    })
    .filter((item): item is MarketIndexDaily => item !== null);
}
