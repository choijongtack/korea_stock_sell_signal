import "server-only";
import { uploadKrxDailyCsv, downloadKrxDailyCsv } from "@/lib/supabaseStorage";

export type KrxStockMarket = "KOSPI" | "KOSDAQ";
export type KrxStockRecord = Record<string, unknown>;

export type StoredKrxStockDaily = {
  trade_date: string;
  market: KrxStockMarket;
  stock_code: string;
  stock_name: string;
  close_price: number | null;
  change_price: number | null;
  change_rate: number | null;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  volume: number | null;
  trading_value_krw: number | null;
  market_cap_krw: number | null;
  listed_shares: number | null;
  raw_payload?: unknown;
};

const getBaseUrl = () => (process.env.KRX_OPENAPI_BASE_URL ?? "").replace(/\/+$/, "");
const getAuthKey = () => process.env.KRX_OPENAPI_AUTH_KEY ?? "";
const getAuthKeyKospi = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSPI ?? "";
const getAuthKeyKosdaq = () => process.env.KRX_OPENAPI_AUTH_KEY_KOSDAQ ?? "";
const getStocksApiIdKospi = () => process.env.KRX_OPENAPI_STOCKS_API_ID_KOSPI ?? "";
const getStocksApiIdKosdaq = () => process.env.KRX_OPENAPI_STOCKS_API_ID_KOSDAQ ?? "";

const MIN_COMPLETE_ROWS: Record<KrxStockMarket, number> = {
  KOSPI: 700,
  KOSDAQ: 1200
};

export const toYmd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
export const toIsoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function apiIdForMarket(market: KrxStockMarket): string {
  return market === "KOSPI" ? getStocksApiIdKospi() : getStocksApiIdKosdaq();
}

function authKeyForMarket(market: KrxStockMarket): string {
  if (market === "KOSPI" && getAuthKeyKospi()) return getAuthKeyKospi();
  if (market === "KOSDAQ" && getAuthKeyKosdaq()) return getAuthKeyKosdaq();
  return getAuthKey();
}

function extractRows(json: unknown): KrxStockRecord[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const candidate = root.OutBlock_1 ?? root.output ?? root.data;
  return Array.isArray(candidate) ? candidate.filter((row): row is KrxStockRecord => Boolean(row) && typeof row === "object") : [];
}

function mapRemoteRow(row: KrxStockRecord, fallbackYmd: string, fallbackMarket: KrxStockMarket) {
  const basDd = String(row.BAS_DD ?? fallbackYmd).replace(/[^\d]/g, "");
  const tradeDate = basDd.length === 8 ? toIsoDate(basDd) : toIsoDate(fallbackYmd);
  const marketRaw = String(row.MKT_NM ?? fallbackMarket).toUpperCase();
  const market: KrxStockMarket = marketRaw.includes("KOSDAQ") ? "KOSDAQ" : "KOSPI";
  const stockCode = String(row.ISU_CD ?? row.ISU_SRT_CD ?? "").trim();
  const stockName = String(row.ISU_NM ?? row.ISU_ABBRV ?? "").trim();
  if (!stockCode || !stockName) return null;

  const now = new Date().toISOString();
  return {
    trade_date: tradeDate,
    market,
    stock_code: stockCode,
    stock_name: stockName,
    close_price: toNumber(row.TDD_CLSPRC),
    change_price: toNumber(row.CMPPREVDD_PRC),
    change_rate: toNumber(row.FLUC_RT),
    open_price: toNumber(row.TDD_OPNPRC),
    high_price: toNumber(row.TDD_HGPRC),
    low_price: toNumber(row.TDD_LWPRC),
    volume: toNumber(row.ACC_TRDVOL),
    trading_value_krw: toNumber(row.ACC_TRDVAL),
    market_cap_krw: toNumber(row.MKTCAP),
    listed_shares: toNumber(row.LIST_SHRS),
    created_at: now,
    updated_at: now
  };
}

export function storedRowsToKrxRecords(rows: StoredKrxStockDaily[]): KrxStockRecord[] {
  return rows.map((row) => ({
    BAS_DD: String(row.trade_date).replace(/[^\d]/g, ""),
    MKT_NM: row.market,
    ISU_CD: row.stock_code,
    ISU_NM: row.stock_name,
    TDD_CLSPRC: row.close_price,
    CMPPREVDD_PRC: row.change_price,
    FLUC_RT: row.change_rate,
    TDD_OPNPRC: row.open_price,
    TDD_HGPRC: row.high_price,
    TDD_LWPRC: row.low_price,
    ACC_TRDVOL: row.volume,
    ACC_TRDVAL: row.trading_value_krw,
    MKTCAP: row.market_cap_krw,
    LIST_SHRS: row.listed_shares
  }));
}

function normalizeStoredMarket(value: unknown): KrxStockMarket | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw.includes("KOSDAQ")) return "KOSDAQ";
  if (raw.includes("KOSPI")) return "KOSPI";
  return null;
}

function normalizeStoredRows(rows: Record<string, unknown>[]): StoredKrxStockDaily[] {
  return rows
    .map((row): StoredKrxStockDaily | null => {
      const market = normalizeStoredMarket(row.market ?? row.MKT_NM);
      const tradeDateRaw = String(row.trade_date ?? row.tradeDate ?? row.BAS_DD ?? "").replace(/[^\d]/g, "");
      const tradeDate = tradeDateRaw.length === 8 ? toIsoDate(tradeDateRaw) : String(row.trade_date ?? row.tradeDate ?? "");
      const stockCode = String(row.stock_code ?? row.stockCode ?? row.ISU_CD ?? row.ISU_SRT_CD ?? "").trim();
      const stockName = String(row.stock_name ?? row.stockName ?? row.ISU_NM ?? row.ISU_ABBRV ?? "").trim();
      if (!market || !tradeDate || !stockCode || !stockName) return null;

      return {
        trade_date: tradeDate,
        market,
        stock_code: stockCode,
        stock_name: stockName,
        close_price: toNumber(row.close_price ?? row.closePrice ?? row.TDD_CLSPRC),
        change_price: toNumber(row.change_price ?? row.changePrice ?? row.CMPPREVDD_PRC),
        change_rate: toNumber(row.change_rate ?? row.changeRate ?? row.FLUC_RT),
        open_price: toNumber(row.open_price ?? row.openPrice ?? row.TDD_OPNPRC),
        high_price: toNumber(row.high_price ?? row.highPrice ?? row.TDD_HGPRC),
        low_price: toNumber(row.low_price ?? row.lowPrice ?? row.TDD_LWPRC),
        volume: toNumber(row.volume ?? row.ACC_TRDVOL),
        trading_value_krw: toNumber(row.trading_value_krw ?? row.tradingValueKrw ?? row.ACC_TRDVAL),
        market_cap_krw: toNumber(row.market_cap_krw ?? row.marketCapKrw ?? row.MKTCAP),
        listed_shares: toNumber(row.listed_shares ?? row.listedShares ?? row.LIST_SHRS),
        raw_payload: row.raw_payload
      };
    })
    .filter((row): row is StoredKrxStockDaily => row !== null);
}

export async function getStoredKrxStockDailyRows(ymd: string, market?: KrxStockMarket): Promise<StoredKrxStockDaily[]> {
  try {
    const csvRows = await downloadKrxDailyCsv(ymd);
    const allRows = normalizeStoredRows(csvRows);
    
    const filtered = market 
      ? allRows.filter((r) => r.market === market)
      : allRows;

    return filtered;
  } catch (error) {
    console.warn(`getLocalKrxStockDailyRows: Failed to load ${ymd} from storage:`, error);
    return [];
  }
}

export async function getLocalKrxStockDailyRows(ymd: string, market?: KrxStockMarket): Promise<KrxStockRecord[]> {
  return storedRowsToKrxRecords(await getStoredKrxStockDailyRows(ymd, market));
}

async function fetchKrxStockRowsFromOpenApi(ymd: string, market: KrxStockMarket): Promise<{ rows: KrxStockRecord[]; warning?: string }> {
  const base = getBaseUrl();
  const key = authKeyForMarket(market);
  const apiId = apiIdForMarket(market);
  if (!base) return { rows: [], warning: "KRX_OPENAPI_BASE_URL is missing." };
  if (!key) return { rows: [], warning: `${market} KRX auth key is missing.` };
  if (!apiId) return { rows: [], warning: `${market} KRX stock API ID is missing.` };

  const candidates = [
    { method: "POST", url: `${base}/svc/apis/sto/${apiId}`, body: JSON.stringify({ basDd: ymd }) },
    { method: "GET", url: `${base}/svc/apis/sto/${apiId}?basDd=${ymd}` }
  ] as const;
  const failures: string[] = [];

  for (const candidate of candidates) {
    const res = await fetch(candidate.url, {
      method: candidate.method,
      headers:
        candidate.method === "POST"
          ? { AUTH_KEY: key, "Content-Type": "application/json", Accept: "application/json" }
          : { AUTH_KEY: key, Accept: "application/json" },
      body: candidate.method === "POST" ? candidate.body : undefined,
      cache: "no-store"
    });
    if (!res.ok) {
      failures.push(`${candidate.method} ${new URL(candidate.url).pathname} ${res.status}`);
      continue;
    }

    const json = (await res.json().catch(() => null)) as unknown;
    const rows = extractRows(json);
    if (rows.length > 0) return { rows };
    failures.push(`${candidate.method} ${new URL(candidate.url).pathname} empty`);
  }

  return { rows: [], warning: failures.join(" ; ") };
}

function isCompleteMarketDump(market: KrxStockMarket, rows: StoredKrxStockDaily[]) {
  return rows.length >= MIN_COMPLETE_ROWS[market];
}

function dedupeRows(rows: StoredKrxStockDaily[]) {
  const byKey = new Map<string, StoredKrxStockDaily>();
  for (const row of rows) {
    byKey.set(`${row.trade_date}_${row.market}_${row.stock_code}`, row);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const marketOrder = a.market.localeCompare(b.market);
    if (marketOrder !== 0) return marketOrder;
    return a.stock_code.localeCompare(b.stock_code);
  });
}

export async function ensureKrxStockDailyRows(ymd: string, market: KrxStockMarket): Promise<{ rows: KrxStockRecord[]; inserted: number; source: "cache" | "api"; warning?: string }> {
  const existingAllMarkets = await getStoredKrxStockDailyRows(ymd);
  const existingMarketRows = existingAllMarkets.filter((row) => row.market === market);
  if (isCompleteMarketDump(market, existingMarketRows)) {
    return { rows: storedRowsToKrxRecords(existingMarketRows), inserted: 0, source: "cache" };
  }

  const fetched = await fetchKrxStockRowsFromOpenApi(ymd, market);
  if (fetched.rows.length === 0) {
    if (existingMarketRows.length > 0) {
      return {
        rows: storedRowsToKrxRecords(existingMarketRows),
        inserted: 0,
        source: "cache",
        warning: `${ymd} ${market} CSV dump has only ${existingMarketRows.length} rows and KRX refresh failed.${fetched.warning ? ` ${fetched.warning}` : ""}`
      };
    }
    return { rows: [], inserted: 0, source: "api", warning: fetched.warning };
  }

  const payload = fetched.rows
    .map((row) => mapRemoteRow(row, ymd, market))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (payload.length === 0) return { rows: [], inserted: 0, source: "api", warning: `${ymd} ${market} KRX stock row mapping failed.` };

  const otherMarkets = existingAllMarkets.filter((row) => row.market !== market);
  const combined = dedupeRows([...otherMarkets, ...payload]);
  await uploadKrxDailyCsv(ymd, combined as unknown as Record<string, unknown>[]);

  return { rows: fetched.rows, inserted: payload.length, source: "api" };
}
