import type { HoldingItem, MenuItem, SignalItem } from "@/types";

export const menuItems: MenuItem[] = ["Dashboard", "Upload", "Signals", "Holdings"];

export const mockSignals: SignalItem[] = [
  { id: 1, ticker: "005930", name: "삼성전자", signal: "SELL", score: 82, reason: "단기 모멘텀 둔화" },
  { id: 2, ticker: "000660", name: "SK하이닉스", signal: "HOLD", score: 54, reason: "변동성 확대 구간" },
  { id: 3, ticker: "035420", name: "NAVER", signal: "SELL", score: 77, reason: "거래량 대비 약세" }
];

export const mockHoldings: HoldingItem[] = [
  { ticker: "005930", quantity: 24, avgPrice: 70500, currentPrice: 68900, pnlRate: -2.27 },
  { ticker: "000660", quantity: 10, avgPrice: 172000, currentPrice: 175300, pnlRate: 1.92 },
  { ticker: "035420", quantity: 14, avgPrice: 198000, currentPrice: 187500, pnlRate: -5.3 }
];
