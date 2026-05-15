export type MenuItem = "Dashboard" | "Upload" | "Signals" | "Holdings";

export interface SignalItem {
  id: number;
  ticker: string;
  name: string;
  signal: "SELL" | "HOLD";
  score: number;
  reason: string;
}

export interface HoldingItem {
  ticker: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnlRate: number;
}
