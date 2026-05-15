import { sma } from "@/lib/indicators";

export interface MarketDailyRow {
  tradeDate: string;
  close: number;
}

export interface LiquiditySignalRow {
  tradeDate: string;
  liquidityScore: number;
}

export interface SellSignal {
  tradeDate: string;
  close: number;
  reason: string;
}

export function generateSellSignals(marketRows: MarketDailyRow[], liquidityRows: LiquiditySignalRow[]): SellSignal[] {
  const closes = marketRows.map((row) => row.close);
  const sma20 = sma(closes, 20);
  const liquidityByDate = new Map(liquidityRows.map((row) => [row.tradeDate, row.liquidityScore]));

  return marketRows.flatMap((row, index) => {
    const ma20 = sma20[index];
    const liquidityScore = liquidityByDate.get(row.tradeDate) ?? 0;
    const reasons: string[] = [];

    if (ma20 !== null && row.close < ma20) reasons.push("Price below SMA20");
    if (liquidityScore >= 3) reasons.push(`Liquidity score ${liquidityScore}`);

    if (reasons.length === 0) return [];
    return [{ tradeDate: row.tradeDate, close: row.close, reason: reasons.join(" | ") }];
  });
}

