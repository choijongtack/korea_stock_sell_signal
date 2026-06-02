import type { InvestorFlowDaily, MarketBreadthDaily, MarketCmaDaily, MarketCreditBalanceDaily, MarketIndexDaily, MarketLiquidityDaily, MarketM2Monthly, KrxStockDaily } from "@/types/market";

type SaveResult = { success: true; count: number } | { success: false; message: string };
type PartialMarketLiquidityDaily = Pick<MarketLiquidityDaily, "tradeDate" | "createdAt"> &
  Partial<Omit<MarketLiquidityDaily, "tradeDate" | "createdAt">>;

type UploadPayload =
  | { dataType: "market_liquidity_partial"; rows: PartialMarketLiquidityDaily[] }
  | { dataType: "market_index"; rows: MarketIndexDaily[] }
  | { dataType: "investor_flow"; rows: InvestorFlowDaily[] }
  | { dataType: "market_cma"; rows: MarketCmaDaily[] }
  | { dataType: "market_credit_balance"; rows: MarketCreditBalanceDaily[] }
  | { dataType: "market_m2_monthly"; rows: MarketM2Monthly[] }
  | { dataType: "krx_market_breadth"; rows: MarketBreadthDaily[] }
  | { dataType: "krx_stock_daily"; rows: KrxStockDaily[] };

async function saveToServer(payload: UploadPayload): Promise<SaveResult> {
  const response = await fetch("/api/upload-market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as SaveResult;
  if (!response.ok) {
    return { success: false, message: "message" in data ? data.message : "Upload request failed." };
  }
  return data;
}

export function upsertMarketLiquidityDailyPartial(rows: PartialMarketLiquidityDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "market_liquidity_partial", rows });
}

export function upsertMarketIndexDaily(rows: MarketIndexDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "market_index", rows });
}

export function upsertInvestorFlowDaily(rows: InvestorFlowDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "investor_flow", rows });
}

export function upsertMarketCmaDaily(rows: MarketCmaDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "market_cma", rows });
}

export function upsertMarketCreditBalanceDaily(rows: MarketCreditBalanceDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "market_credit_balance", rows });
}

export function upsertMarketM2Monthly(rows: MarketM2Monthly[]): Promise<SaveResult> {
  return saveToServer({ dataType: "market_m2_monthly", rows });
}

export function upsertMarketBreadthDaily(rows: MarketBreadthDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "krx_market_breadth", rows });
}

export function upsertKrxStockDaily(rows: KrxStockDaily[]): Promise<SaveResult> {
  return saveToServer({ dataType: "krx_stock_daily", rows });
}
