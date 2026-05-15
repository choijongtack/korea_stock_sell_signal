import type { MarketCmaDaily, MarketCreditBalanceDaily, MarketLiquidityDaily } from "@/types/market";

type RawRow = Record<string, any>;

type LiquidityField = Exclude<keyof MarketLiquidityDaily, "createdAt">;
type PartialLiquidityRow = Pick<MarketLiquidityDaily, "tradeDate" | "createdAt"> & Partial<Record<Exclude<LiquidityField, "tradeDate">, number | null>>;

export interface NormalizeFreesisResult {
  data: PartialLiquidityRow[];
  warnings: string[];
}

export interface NormalizeFreesisCreditResult {
  data: MarketCreditBalanceDaily[];
  warnings: string[];
}

export interface NormalizeFreesisCmaResult {
  data: MarketCmaDaily[];
  warnings: string[];
}

interface NormalizeOptions {
  createdAt?: string;
}

const DATE_HEADER_CANDIDATES = ["일자", "구분", "구 분"];

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "").replace(/\n/g, "");

const toDateString = (value: any): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const compactDigits = raw.replace(/[^\d]/g, "");
  if (compactDigits.length === 8) {
    return `${compactDigits.slice(0, 4)}-${compactDigits.slice(4, 6)}-${compactDigits.slice(6, 8)}`;
  }

  const normalized = raw.replace(/[./]/g, "-");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const toNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value).trim();
  if (!normalized || normalized === "-") return null;

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function buildHeaderResolver(rows: RawRow[]) {
  const actualHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => actualHeaders.add(key)));

  const normalizedToOriginal = new Map<string, string>();
  actualHeaders.forEach((header) => normalizedToOriginal.set(normalizeHeader(header), header));

  return (expectedHeader: string): string | null => normalizedToOriginal.get(normalizeHeader(expectedHeader)) ?? null;
}

function detectDateHeader(rows: RawRow[]): string | null {
  const resolve = buildHeaderResolver(rows);
  for (const candidate of DATE_HEADER_CANDIDATES) {
    const resolved = resolve(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function normalizeFreesisMarketLiquidity(rows: RawRow[], options: NormalizeOptions = {}): NormalizeFreesisResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const resolve = buildHeaderResolver(rows);
  const dateHeader = detectDateHeader(rows);

  const map = {
    investorDepositMillionKrw: ["투자자예탁금(장내파생상품거래예수금제외)", "투자자예탁금"],
    derivativesDepositMillionKrw: ["장내파생상품거래예수금"],
    rpBalanceMillionKrw: ["대고객환매조건부채권(rp)매도잔고", "대고객환매조건부채권rp매도잔고"],
    unsettledBalanceMillionKrw: ["위탁매매미수금"]
  } as const;

  const headers = Object.fromEntries(
    Object.entries(map).map(([field, names]) => {
      const resolved = names.map((n) => resolve(n)).find((h) => h !== null) ?? null;
      if (!resolved) warnings.push(`Expected column not found: ${field}`);
      return [field, resolved];
    })
  ) as Record<keyof typeof map, string | null>;

  if (!dateHeader) {
    warnings.push("Expected date column not found.");
    return { data: [], warnings };
  }

  const data = rows
    .map((row): PartialLiquidityRow | null => {
      const tradeDate = toDateString(row[dateHeader]);
      if (!tradeDate) return null;

      return {
        tradeDate,
        investorDepositMillionKrw: headers.investorDepositMillionKrw ? toNumberOrNull(row[headers.investorDepositMillionKrw]) : undefined,
        derivativesDepositMillionKrw: headers.derivativesDepositMillionKrw ? toNumberOrNull(row[headers.derivativesDepositMillionKrw]) : undefined,
        rpBalanceMillionKrw: headers.rpBalanceMillionKrw ? toNumberOrNull(row[headers.rpBalanceMillionKrw]) : undefined,
        unsettledBalanceMillionKrw: headers.unsettledBalanceMillionKrw ? toNumberOrNull(row[headers.unsettledBalanceMillionKrw]) : undefined,
        createdAt
      };
    })
    .filter((item): item is PartialLiquidityRow => item !== null);

  return { data, warnings };
}

export function normalizeFreesisCreditBalance(rows: RawRow[], options: NormalizeOptions = {}): NormalizeFreesisCreditResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const resolve = buildHeaderResolver(rows);
  const dateHeader = detectDateHeader(rows);

  const map = {
    creditLoanMillionKrw: ["신용거래융자전체"],
    creditShortMillionKrw: ["신용거래대주전체"],
    collateralLoanMillionKrw: ["예탁증권담보융자"]
  } as const;

  const headers = Object.fromEntries(
    Object.entries(map).map(([field, names]) => {
      const resolved = names.map((n) => resolve(n)).find((h) => h !== null) ?? null;
      if (!resolved) warnings.push(`Expected column not found: ${field}`);
      return [field, resolved];
    })
  ) as Record<keyof typeof map, string | null>;

  if (!dateHeader) {
    warnings.push("Expected date column not found.");
    return { data: [], warnings };
  }

  const data = rows
    .map((row): MarketCreditBalanceDaily | null => {
      const tradeDate = toDateString(row[dateHeader]);
      if (!tradeDate) return null;

      const creditLoan = headers.creditLoanMillionKrw ? toNumberOrNull(row[headers.creditLoanMillionKrw]) : null;
      const creditShort = headers.creditShortMillionKrw ? toNumberOrNull(row[headers.creditShortMillionKrw]) : null;
      const collateral = headers.collateralLoanMillionKrw ? toNumberOrNull(row[headers.collateralLoanMillionKrw]) : null;

      const allNumbers = [creditLoan, creditShort, collateral].every((v) => typeof v === "number");
      const totalCredit = allNumbers ? (creditLoan as number) + (creditShort as number) + (collateral as number) : null;

      return {
        tradeDate,
        creditLoanMillionKrw: creditLoan,
        creditShortMillionKrw: creditShort,
        collateralLoanMillionKrw: collateral,
        totalCreditMillionKrw: totalCredit,
        createdAt
      };
    })
    .filter((item): item is MarketCreditBalanceDaily => item !== null);

  return { data, warnings };
}

export function normalizeFreesisCma(rows: RawRow[], options: NormalizeOptions = {}): NormalizeFreesisCmaResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const resolve = buildHeaderResolver(rows);
  const dateHeader = detectDateHeader(rows);

  if (!dateHeader) {
    warnings.push("Expected date column not found.");
    return { data: [], warnings };
  }

  const map = {
    rpTypeMillionKrw: ["rp형"],
    mmfTypeMillionKrw: ["mmf형"],
    jonggeumTypeMillionKrw: ["종금형"],
    issuingNoteTypeMillionKrw: ["발행어음형"],
    otherTypeMillionKrw: ["기타형(mmw형등)", "기타형(mmw형 등)"],
    totalMillionKrw: ["합계"]
  } as const;

  const headers = Object.fromEntries(
    Object.entries(map).map(([field, names]) => {
      const resolved = names.map((n) => resolve(n)).find((h) => h !== null) ?? null;
      if (!resolved) warnings.push(`Expected column not found: ${field}`);
      return [field, resolved];
    })
  ) as Record<keyof typeof map, string | null>;

  const data = rows
    .map((row): MarketCmaDaily | null => {
      const tradeDate = toDateString(row[dateHeader]);
      if (!tradeDate) return null;

      return {
        tradeDate,
        rpTypeMillionKrw: headers.rpTypeMillionKrw ? toNumberOrNull(row[headers.rpTypeMillionKrw]) : null,
        mmfTypeMillionKrw: headers.mmfTypeMillionKrw ? toNumberOrNull(row[headers.mmfTypeMillionKrw]) : null,
        jonggeumTypeMillionKrw: headers.jonggeumTypeMillionKrw ? toNumberOrNull(row[headers.jonggeumTypeMillionKrw]) : null,
        issuingNoteTypeMillionKrw: headers.issuingNoteTypeMillionKrw ? toNumberOrNull(row[headers.issuingNoteTypeMillionKrw]) : null,
        otherTypeMillionKrw: headers.otherTypeMillionKrw ? toNumberOrNull(row[headers.otherTypeMillionKrw]) : null,
        totalMillionKrw: headers.totalMillionKrw ? toNumberOrNull(row[headers.totalMillionKrw]) : null,
        createdAt
      };
    })
    .filter((item): item is MarketCmaDaily => item !== null);

  return { data, warnings };
}

export function normalizeFreesisLiquidity(rows: RawRow[], options: NormalizeOptions = {}): NormalizeFreesisResult {
  return normalizeFreesisMarketLiquidity(rows, options);
}
