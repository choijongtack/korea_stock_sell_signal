import type { MarketM2Monthly } from "@/types/market";

type RawRow = Record<string, unknown>;

interface NormalizeOptions {
  createdAt?: string;
}

interface NormalizeResult {
  data: MarketM2Monthly[];
  warnings: string[];
}

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const pickHeader = (headers: Map<string, string>, names: string[]): string | null => {
  for (const name of names) {
    const found = headers.get(normalizeHeader(name));
    if (found) return found;
  }
  return null;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMonthDate = (value: unknown): { tradeDate: string; sourceTime: string } | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const compact = raw.replace(/[^\d]/g, "");

  if (compact.length === 6) {
    return {
      tradeDate: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-01`,
      sourceTime: compact
    };
  }

  if (compact.length === 8) {
    return {
      tradeDate: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-01`,
      sourceTime: compact.slice(0, 6)
    };
  }

  const parsed = new Date(raw.replace(/[./]/g, "-"));
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return {
    tradeDate: `${year}-${month}-01`,
    sourceTime: `${year}${month}`
  };
};

export function normalizeEcosM2(rows: RawRow[], options: NormalizeOptions = {}): NormalizeResult {
  if (rows.length === 0) return { data: [], warnings: [] };

  const createdAt = options.createdAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const allHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => allHeaders.add(key)));

  const normalizedToOriginal = new Map<string, string>();
  allHeaders.forEach((header) => normalizedToOriginal.set(normalizeHeader(header), header));

  const timeHeader = pickHeader(normalizedToOriginal, ["TIME", "time", "tradeMonth", "trade_date", "tradeDate", "date", "month"]);
  const valueHeader = pickHeader(normalizedToOriginal, ["DATA_VALUE", "dataValue", "m2BillionKrw", "m2_billion_krw", "M2", "value"]);
  const unitHeader = pickHeader(normalizedToOriginal, ["UNIT_NAME", "unitName", "unit"]);

  if (!timeHeader) warnings.push("Expected M2 month column not found. Use TIME, tradeMonth, tradeDate, date, or month.");
  if (!valueHeader) warnings.push("Expected M2 value column not found. Use DATA_VALUE, m2BillionKrw, M2, or value.");
  if (!timeHeader || !valueHeader) return { data: [], warnings };

  const byDate = new Map<string, MarketM2Monthly>();
  rows.forEach((row, index) => {
    const month = toMonthDate(row[timeHeader]);
    const m2BillionKrw = toNumberOrNull(row[valueHeader]);
    if (!month || m2BillionKrw === null) {
      warnings.push(`Skipped row ${index + 1}: missing month or M2 value.`);
      return;
    }

    byDate.set(month.tradeDate, {
      tradeDate: month.tradeDate,
      sourceTime: month.sourceTime,
      m2BillionKrw,
      unitName: unitHeader ? String(row[unitHeader] ?? "십억원") : "십억원",
      statCode: "161Y006",
      itemCode: "BBHA00",
      createdAt
    });
  });

  return {
    data: Array.from(byDate.values()).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
    warnings
  };
}
