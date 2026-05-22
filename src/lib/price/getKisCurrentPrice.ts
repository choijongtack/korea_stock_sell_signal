import "server-only";
import type { RealtimePrice } from "@/lib/price/types";

type KisToken = {
  accessToken: string;
  expiresAtMs: number;
};

type KisCurrentPriceOutput = {
  stck_prpr?: string;
  prdy_ctrt?: string;
  acml_vol?: string;
  hts_kor_isnm?: string;
};

const DEFAULT_BASE_URL = "https://openapi.koreainvestment.com:9443";
const KIS_CURRENT_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price";
const KIS_CURRENT_PRICE_TR_ID = "FHKST01010100";

let tokenCache: KisToken | null = null;

const getBaseUrl = () => (process.env.KIS_OPENAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const getAppKey = () => process.env.KIS_OPENAPI_APP_KEY?.trim() ?? "";
const getAppSecret = () => process.env.KIS_OPENAPI_APP_SECRET?.trim() ?? "";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeStockCode(stockCode: string): string {
  const normalized = stockCode.trim().toUpperCase();
  return normalized.startsWith("A") && normalized.length === 7 ? normalized.slice(1) : normalized;
}

async function getAccessToken(): Promise<string> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  if (!appKey || !appSecret) {
    throw new Error("KIS OpenAPI credentials are missing. Set KIS_OPENAPI_APP_KEY and KIS_OPENAPI_APP_SECRET in .env.local.");
  }

  if (tokenCache && tokenCache.expiresAtMs - Date.now() > 60_000) return tokenCache.accessToken;

  const res = await fetch(`${getBaseUrl()}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret
    }),
    cache: "no-store"
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new Error(`KIS token request failed (${res.status}).`);
  }

  const accessToken = String(json.access_token ?? "");
  if (!accessToken) {
    throw new Error(`KIS token response missing access_token: ${String(json.msg1 ?? json.error_description ?? "unknown error")}`);
  }

  const expiresIn = toNumber(json.expires_in) ?? 86_400;
  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresIn - 60) * 1000
  };
  return accessToken;
}

export async function getKisCurrentPrice(stockCode: string): Promise<RealtimePrice> {
  const normalizedStockCode = normalizeStockCode(stockCode);
  if (!/^\d{6}$/.test(normalizedStockCode)) {
    throw new Error(`Invalid KIS stock code: ${stockCode}`);
  }

  const token = await getAccessToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: normalizedStockCode
  });

  const res = await fetch(`${getBaseUrl()}${KIS_CURRENT_PRICE_PATH}?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
      authorization: `Bearer ${token}`,
      appkey: getAppKey(),
      appsecret: getAppSecret(),
      tr_id: KIS_CURRENT_PRICE_TR_ID
    },
    cache: "no-store"
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new Error(`KIS current price request failed (${res.status}).`);
  }

  const rtCd = String(json.rt_cd ?? "");
  if (rtCd && rtCd !== "0") {
    throw new Error(`KIS current price error: ${String(json.msg_cd ?? "")} ${String(json.msg1 ?? "")}`.trim());
  }

  const output = json.output as KisCurrentPriceOutput | undefined;
  const currentPrice = toNumber(output?.stck_prpr);
  if (currentPrice === null || currentPrice <= 0) {
    throw new Error(`KIS current price response missing stck_prpr for stock_code=${normalizedStockCode}`);
  }

  return {
    stock_code: normalizedStockCode,
    stock_name: output?.hts_kor_isnm,
    current_price: currentPrice,
    change_rate: toNumber(output?.prdy_ctrt) ?? undefined,
    volume: toNumber(output?.acml_vol) ?? undefined,
    source: "KIS",
    fetched_at: new Date().toISOString()
  };
}
