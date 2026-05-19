import type { KrxStockDaily } from "@/types/market";

type RawRow = Record<string, any>;
type KrxStockDailyField = Exclude<keyof KrxStockDaily, "createdAt" | "updatedAt">;

const krxStockColumnMap: Record<string, KrxStockDailyField> = {
  "기준일": "tradeDate",
  "일자": "tradeDate",
  "날짜": "tradeDate",
  "basdd": "tradeDate",
  "trade_date": "tradeDate",
  "tradedate": "tradeDate",
  "date": "tradeDate",

  "시장명": "market",
  "시장구분": "market",
  "mktnm": "market",
  "mkttpnm": "market",
  "market": "market",

  "종목코드": "stockCode",
  "isucd": "stockCode",
  "isusrtcd": "stockCode",
  "stock_code": "stockCode",
  "stockcode": "stockCode",

  "종목명": "stockName",
  "isunm": "stockName",
  "isuabbrv": "stockName",
  "stock_name": "stockName",
  "stockname": "stockName",

  "종가": "closePrice",
  "tddclsprc": "closePrice",
  "close_price": "closePrice",
  "closeprice": "closePrice",
  "close": "closePrice",

  "대비": "changePrice",
  "cmpprevddprc": "changePrice",
  "change_price": "changePrice",
  "changeprice": "changePrice",
  "change": "changePrice",

  "등락률": "changeRate",
  "flucrt": "changeRate",
  "change_rate": "changeRate",
  "changerate": "changeRate",

  "시가": "openPrice",
  "tddopnprc": "openPrice",
  "open_price": "openPrice",
  "openprice": "openPrice",
  "open": "openPrice",

  "고가": "highPrice",
  "tddhgprc": "highPrice",
  "high_price": "highPrice",
  "highprice": "highPrice",
  "high": "highPrice",

  "저가": "lowPrice",
  "tddlwprc": "lowPrice",
  "low_price": "lowPrice",
  "lowprice": "lowPrice",
  "low": "lowPrice",

  "거래량": "volume",
  "acctrdvol": "volume",
  "volume": "volume",

  "거래대금": "tradingValueKrw",
  "acctrdval": "tradingValueKrw",
  "trading_value": "tradingValueKrw",
  "tradingvalue": "tradingValueKrw",

  "시가총액": "marketCapKrw",
  "mktcap": "marketCapKrw",
  "market_cap": "marketCapKrw",
  "marketcap": "marketCapKrw",

  "상장주식수": "listedShares",
  "listshrs": "listedShares",
  "listed_shares": "listedShares",
  "listedshares": "listedShares"
};

interface NormalizeOptions {
  tradeDate?: string;
  market?: "KOSPI" | "KOSDAQ";
}

interface NormalizeResult {
  data: KrxStockDaily[];
  warnings: string[];
}

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const normalizeMarketName = (value: any): "KOSPI" | "KOSDAQ" | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes("KOSDAQ") || raw.includes("코스닥")) return "KOSDAQ";
  if (raw.includes("KOSPI") || raw.includes("코스피")) return "KOSPI";
  return null;
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

const readMappedValue = (row: RawRow, headerMap: Map<KrxStockDailyField, string>, field: KrxStockDailyField): any => {
  const header = headerMap.get(field);
  return header ? row[header] : null;
};

export function normalizeKrxStockDaily(rows: RawRow[], options: NormalizeOptions = {}): NormalizeResult {
  if (rows.length === 0) return { data: [], warnings: [] };

  const allHeaders = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => allHeaders.add(key)));
  const normalizedHeaderToOriginal = new Map<string, string>();
  allHeaders.forEach((header) => normalizedHeaderToOriginal.set(normalizeHeader(header), header));

  const headerMap = new Map<KrxStockDailyField, string>();
  Object.entries(krxStockColumnMap).forEach(([sourceHeader, targetField]) => {
    const resolved = normalizedHeaderToOriginal.get(normalizeHeader(sourceHeader));
    if (resolved && !headerMap.has(targetField)) headerMap.set(targetField, resolved);
  });

  const warnings: string[] = [];
  const validData: KrxStockDaily[] = [];

  rows.forEach((row, index) => {
    const tradeDateRaw = readMappedValue(row, headerMap, "tradeDate");
    let tradeDate = toDateString(tradeDateRaw);
    if (!tradeDate) {
      if (options.tradeDate) {
        tradeDate = options.tradeDate;
      } else {
        warnings.push(`Row ${index + 1}: Missing or invalid date.`);
        return;
      }
    }

    const marketRaw = readMappedValue(row, headerMap, "market");
    let market = normalizeMarketName(marketRaw);
    if (!market) {
      if (options.market) {
        market = options.market;
      } else {
        warnings.push(`Row ${index + 1}: Missing or invalid market.`);
        return;
      }
    }

    const stockCodeRaw = readMappedValue(row, headerMap, "stockCode");
    let stockCode = stockCodeRaw !== null ? String(stockCodeRaw).trim() : "";
    if (!stockCode) {
      warnings.push(`Row ${index + 1}: Missing stock code.`);
      return;
    }
    // Clean stock code, e.g. A005930 -> 005930
    if (stockCode.toUpperCase().startsWith("A") && stockCode.length === 7) {
      stockCode = stockCode.slice(1);
    }

    const stockNameRaw = readMappedValue(row, headerMap, "stockName");
    const stockName = stockNameRaw !== null ? String(stockNameRaw).trim() : "";
    if (!stockName) {
      warnings.push(`Row ${index + 1}: Missing stock name.`);
      return;
    }

    validData.push({
      tradeDate,
      market,
      stockCode,
      stockName,
      closePrice: toNumberOrNull(readMappedValue(row, headerMap, "closePrice")),
      changePrice: toNumberOrNull(readMappedValue(row, headerMap, "changePrice")),
      changeRate: toRateNumberOrNull(readMappedValue(row, headerMap, "changeRate")),
      openPrice: toNumberOrNull(readMappedValue(row, headerMap, "openPrice")),
      highPrice: toNumberOrNull(readMappedValue(row, headerMap, "highPrice")),
      lowPrice: toNumberOrNull(readMappedValue(row, headerMap, "lowPrice")),
      volume: toNumberOrNull(readMappedValue(row, headerMap, "volume")),
      tradingValueKrw: toNumberOrNull(readMappedValue(row, headerMap, "tradingValueKrw")),
      marketCapKrw: toNumberOrNull(readMappedValue(row, headerMap, "marketCapKrw")),
      listedShares: toNumberOrNull(readMappedValue(row, headerMap, "listedShares"))
    });
  });

  return { data: validData, warnings };
}
