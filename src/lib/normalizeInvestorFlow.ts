import type { InvestorFlowDaily } from "@/types/market";

type RawRow = Record<string, any>;
type FlowField = Exclude<keyof InvestorFlowDaily, "createdAt">;

const flowColumnMap: Record<string, FlowField> = {
  date: "tradeDate",
  tradedate: "tradeDate",
  "기준일": "tradeDate",
  "일자": "tradeDate",
  "날짜": "tradeDate",
  "외국인순매수": "foreignNetBuy",
  "외국인": "foreignNetBuy",
  "기관순매수": "institutionNetBuy",
  "기관": "institutionNetBuy",
  "개인순매수": "individualNetBuy",
  "개인": "individualNetBuy",
  "프로그램순매수": "programNetBuy",
  "프로그램": "programNetBuy"
};

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const todayLocalDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toDateString = (value: any): string | null => {
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

const buildHeaderMap = (row: RawRow): Map<string, string> => {
  const map = new Map<string, string>();
  Object.keys(row).forEach((key) => map.set(normalizeHeader(key), key));
  return map;
};

const normalizeDateSummaryFormat = (rows: RawRow[], createdAt: string): InvestorFlowDaily[] => {
  const headerMap = buildHeaderMap(rows[0] ?? {});

  const dateHeader = headerMap.get("date") ?? headerMap.get("tradedate");
  const institutionHeader = headerMap.get("subtotalinstitutions");
  const individualHeader = headerMap.get("individuals");
  const foreignHeader = headerMap.get("totalofforeign");

  if (!dateHeader || !institutionHeader || !individualHeader || !foreignHeader) return [];

  return rows
    .map((row): InvestorFlowDaily | null => {
      const tradeDate = toDateString(row[dateHeader]);
      if (!tradeDate) return null;
      return {
        tradeDate,
        foreignNetBuy: toNumberOrNull(row[foreignHeader]),
        institutionNetBuy: toNumberOrNull(row[institutionHeader]),
        individualNetBuy: toNumberOrNull(row[individualHeader]),
        programNetBuy: null,
        createdAt
      };
    })
    .filter((row): row is InvestorFlowDaily => row !== null)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
};

const resolveInstitutionNetBuy = (byType: Map<string, number | null>): number | null => {
  const subtotal = byType.get("subtotal-institutions") ?? byType.get("subtotal institutions") ?? byType.get("institutions") ?? null;
  if (subtotal !== null) return subtotal;

  const parts = [
    "financial investment",
    "insurance",
    "investment trust",
    "private equity funds",
    "bank",
    "other finances",
    "government pension funds, etc."
  ];

  let sum = 0;
  let found = false;
  for (const key of parts) {
    const v = byType.get(key);
    if (v === null || v === undefined) continue;
    sum += v;
    found = true;
  }
  return found ? sum : null;
};

const normalizeInvestorTypeFormat = (rows: RawRow[], createdAt: string): InvestorFlowDaily[] => {
  const headerMap = buildHeaderMap(rows[0] ?? {});
  const typeHeader = headerMap.get("investortype");
  const valueNetHeader = headerMap.get("tradingvaluenetbuying");
  const dateHeader = headerMap.get("date") ?? headerMap.get("tradedate");
  if (!typeHeader || !valueNetHeader) return [];

  const byDateAndType = new Map<string, Map<string, number | null>>();
  rows.forEach((row) => {
    const tradeDate = toDateString(dateHeader ? row[dateHeader] : null) ?? todayLocalDate();
    const t = String(row[typeHeader] ?? "").trim().toLowerCase();
    if (!t) return;
    const bucket = byDateAndType.get(tradeDate) ?? new Map<string, number | null>();
    bucket.set(t, toNumberOrNull(row[valueNetHeader]));
    byDateAndType.set(tradeDate, bucket);
  });

  return Array.from(byDateAndType.entries())
    .map(([tradeDate, byType]): InvestorFlowDaily | null => {
      const institutionNetBuy = resolveInstitutionNetBuy(byType);
      const individualNetBuy = byType.get("individuals") ?? byType.get("individual") ?? null;
      const foreignNetBuy = byType.get("foreigners") ?? byType.get("foreigner") ?? null;

      if (institutionNetBuy === null && individualNetBuy === null && foreignNetBuy === null) return null;

      return {
        tradeDate,
        foreignNetBuy,
        institutionNetBuy,
        individualNetBuy,
        programNetBuy: null,
        createdAt
      };
    })
    .filter((row): row is InvestorFlowDaily => row !== null)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
};

export function normalizeInvestorFlow(rows: RawRow[], createdAt = "1970-01-01T00:00:00.000Z"): InvestorFlowDaily[] {
  if (rows.length === 0) return [];

  const normalizedHeaders = new Set<string>();
  Object.keys(rows[0] ?? {}).forEach((key) => normalizedHeaders.add(normalizeHeader(key)));

  if (
    normalizedHeaders.has("date") &&
    normalizedHeaders.has("subtotalinstitutions") &&
    normalizedHeaders.has("individuals") &&
    normalizedHeaders.has("totalofforeign")
  ) {
    return normalizeDateSummaryFormat(rows, createdAt);
  }

  if (normalizedHeaders.has("investortype") && normalizedHeaders.has("tradingvaluenetbuying")) {
    return normalizeInvestorTypeFormat(rows, createdAt);
  }

  const allHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => allHeaders.add(key)));
  const normalizedHeaderToOriginal = new Map<string, string>();
  allHeaders.forEach((header) => normalizedHeaderToOriginal.set(normalizeHeader(header), header));

  const fieldToHeader = new Map<FlowField, string>();
  Object.entries(flowColumnMap).forEach(([sourceHeader, field]) => {
    const resolved = normalizedHeaderToOriginal.get(normalizeHeader(sourceHeader));
    if (resolved && !fieldToHeader.has(field)) fieldToHeader.set(field, resolved);
  });

  return rows
    .map((row): InvestorFlowDaily | null => {
      const dateHeader = fieldToHeader.get("tradeDate");
      const tradeDate = toDateString(dateHeader ? row[dateHeader] : null);
      if (!tradeDate) return null;
      return {
        tradeDate,
        foreignNetBuy: toNumberOrNull(fieldToHeader.get("foreignNetBuy") ? row[fieldToHeader.get("foreignNetBuy")!] : null),
        institutionNetBuy: toNumberOrNull(fieldToHeader.get("institutionNetBuy") ? row[fieldToHeader.get("institutionNetBuy")!] : null),
        individualNetBuy: toNumberOrNull(fieldToHeader.get("individualNetBuy") ? row[fieldToHeader.get("individualNetBuy")!] : null),
        programNetBuy: toNumberOrNull(fieldToHeader.get("programNetBuy") ? row[fieldToHeader.get("programNetBuy")!] : null),
        createdAt
      };
    })
    .filter((item): item is InvestorFlowDaily => item !== null);
}
