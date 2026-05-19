export type RiskLevel = "stable" | "caution" | "warning" | "danger" | "crisis";

export interface MarketLiquidityDaily {
  tradeDate: string;
  investorDepositMillionKrw: number | null;
  derivativesDepositMillionKrw: number | null;
  rpBalanceMillionKrw: number | null;
  unsettledBalanceMillionKrw: number | null;
  createdAt: string;
}

export interface MarketCreditBalanceDaily {
  tradeDate: string;
  creditLoanMillionKrw: number | null;
  creditShortMillionKrw: number | null;
  collateralLoanMillionKrw: number | null;
  totalCreditMillionKrw: number | null;
  createdAt: string;
}

export interface MarketIndexDaily {
  tradeDate: string;
  market: "KOSPI" | "KOSDAQ" | "KOSPI200" | string;
  close: number | null;
  change: number | null;
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  tradingValueMillionKrw: number | null;
  createdAt: string;
}

export interface MarketBreadthDaily {
  tradeDate: string;
  market: "KOSPI" | "KOSDAQ" | string;
  advancers: number | null;
  decliners: number | null;
  unchanged: number | null;
  tradingValueMillionKrw: number | null;
  createdAt: string;
}

export interface InvestorFlowDaily {
  tradeDate: string;
  market?: "KOSPI" | "KOSDAQ" | "KOSPI200" | string;
  foreignNetBuy: number | null;
  institutionNetBuy: number | null;
  individualNetBuy: number | null;
  programNetBuy: number | null;
  createdAt: string;
}

export interface KrxInvestorFlowNormalized {
  tradeDate: string;
  market: "KOSPI" | "KOSDAQ" | "KOSPI200" | string;
  institutionNetBuyMillionKrw: number | null;
  individualNetBuyMillionKrw: number | null;
  foreignerNetBuyMillionKrw: number | null;
  otherCorporationNetBuyMillionKrw: number | null;
}

export interface MarketCmaDaily {
  tradeDate: string;
  rpTypeMillionKrw: number | null;
  mmfTypeMillionKrw: number | null;
  jonggeumTypeMillionKrw: number | null;
  issuingNoteTypeMillionKrw: number | null;
  otherTypeMillionKrw: number | null;
  totalMillionKrw: number | null;
  createdAt: string;
}

export interface SignalEvent {
  tradeDate: string;
  ticker: string;
  signalType: "sell" | "reduce" | "hold";
  triggerScore: number;
  triggerReason: string;
  createdAt: string;
}

export interface MarketRiskScore {
  tradeDate: string;
  liquidityScore: number;
  leverageScore: number;
  flowScore: number;
  technicalScore: number;
  marketBreadthScore: number;
  macroScore: number;
  totalScore: number;
  riskLevel: RiskLevel;
  signals: SignalEvent[];
  createdAt: string;
}

export interface KrxStockDaily {
  tradeDate: string;
  market: "KOSPI" | "KOSDAQ";
  stockCode: string;
  stockName: string;
  closePrice: number | null;
  changePrice: number | null;
  changeRate: number | null;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  volume: number | null;
  tradingValueKrw: number | null;
  marketCapKrw: number | null;
  listedShares: number | null;
  createdAt?: string;
  updatedAt?: string;
}

