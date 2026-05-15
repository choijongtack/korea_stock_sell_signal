import type { KrxInvestorFlowNormalized } from "@/types/market";

type RawRow = Record<string, unknown>;

interface NormalizeOptions {
  market?: KrxInvestorFlowNormalized["market"];
}

interface NormalizeResult {
  data: KrxInvestorFlowNormalized[];
  warnings: string[];
}

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const toDateString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d]/g, "");
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(raw.replace(/[./]/g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickHeader = (headers: Map<string, string>, names: string[]): string | null => {
  for (const name of names) {
    const found = headers.get(normalizeHeader(name));
    if (found) return found;
  }
  return null;
};

const resolveMarket = (row: RawRow, marketHeader: string | null, selectedMarket?: string): string => {
  if (selectedMarket) return selectedMarket;
  if (!marketHeader) return "UNKNOWN";
  const raw = String(row[marketHeader] ?? "").toUpperCase();
  if (raw.includes("KOSPI200") || raw.includes("코스피200")) return "KOSPI200";
  if (raw.includes("KOSDAQ") || raw.includes("코스닥")) return "KOSDAQ";
  if (raw.includes("KOSPI") || raw.includes("코스피")) return "KOSPI";
  return raw || "UNKNOWN";
};

export function normalizeKrxInvestorFlow(rows: RawRow[], options: NormalizeOptions = {}): NormalizeResult {
  if (rows.length === 0) return { data: [], warnings: [] };

  const allHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((k) => allHeaders.add(k)));
  const normalizedToOriginal = new Map<string, string>();
  allHeaders.forEach((header) => normalizedToOriginal.set(normalizeHeader(header), header));

  const dateHeader = pickHeader(normalizedToOriginal, ["Date", "tradeDate", "일자", "기준일", "날짜"]);
  const marketHeader = pickHeader(normalizedToOriginal, ["market", "시장", "지수명"]);
  const institutionHeader = pickHeader(normalizedToOriginal, ["Subtotal-Institutions"]);
  const otherCorpHeader = pickHeader(normalizedToOriginal, ["Other corporations"]);
  const individualHeader = pickHeader(normalizedToOriginal, ["Individuals"]);
  const foreignHeader = pickHeader(normalizedToOriginal, ["Total of foreign", "Total of Foreign"]);
  const totalHeader = pickHeader(normalizedToOriginal, ["Total"]);

  const warnings: string[] = [];
  const byDate = new Map<string, KrxInvestorFlowNormalized>();

  rows.forEach((row, rowIndex) => {
    const tradeDate = toDateString(dateHeader ? row[dateHeader] : null);
    if (!tradeDate) return;

    const institution = toNumberOrNull(institutionHeader ? row[institutionHeader] : null);
    const otherCorp = toNumberOrNull(otherCorpHeader ? row[otherCorpHeader] : null);
    const individual = toNumberOrNull(individualHeader ? row[individualHeader] : null);
    const foreigner = toNumberOrNull(foreignHeader ? row[foreignHeader] : null);
    const total = toNumberOrNull(totalHeader ? row[totalHeader] : null);

    if (total !== null) {
      const sum = [institution, otherCorp, individual, foreigner].reduce<number>((acc, v) => acc + (v ?? 0), 0);
      if (Math.abs(sum - total) > 1e-6) {
        warnings.push(`Total mismatch at row ${rowIndex + 1} (${tradeDate}): sum=${sum}, total=${total}`);
      }
    }

    byDate.set(tradeDate, {
      tradeDate,
      market: resolveMarket(row, marketHeader, options.market),
      institutionNetBuyMillionKrw: institution,
      individualNetBuyMillionKrw: individual,
      foreignerNetBuyMillionKrw: foreigner,
      otherCorporationNetBuyMillionKrw: otherCorp
    });
  });

  const data = Array.from(byDate.values()).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return { data, warnings };
}
