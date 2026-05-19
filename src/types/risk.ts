export type RiskLevel = "stable" | "caution" | "warning" | "danger" | "crisis";

export type SignalType = "sell" | "reduce" | "hold";

export interface SignalEvent {
  tradeDate: string;
  ticker: string;
  signalType: SignalType;
  triggerScore: number;
  triggerReason: string;
  createdAt: string;
}

export interface MarketRiskDaily {
  tradeDate: string;
  liquidityScore: number;
  leverageScore: number;
  flowScore: number;
  technicalScore: number;
  marketBreadthScore: number;
  macroScore: number;
  totalScore: number;
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface MarketRiskResult extends MarketRiskDaily {
  signals: SignalEvent[];
}

export interface RiskInputRow {
  tradeDate: string;
}

// Engine boundary types (snake_case)
export type SignalSeverity = "info" | "caution" | "warning" | "danger" | "crisis";

export type MarketLiquidityDaily = {
  trade_date: string;
  investor_deposit_million_krw: number | null;
  derivatives_deposit_million_krw?: number | null;
  rp_balance_million_krw?: number | null;
  unsettled_balance_million_krw?: number | null;
};

export type CreditBalanceDaily = {
  trade_date: string;
  credit_loan_million_krw: number | null;
  credit_short_million_krw?: number | null;
  collateral_loan_million_krw?: number | null;
  total_credit_million_krw?: number | null;
};

export type CmaDaily = {
  trade_date: string;
  cma_balance_million_krw: number | null;
  cma_account_count?: number | null;
};

export type MarketIndexDaily = {
  trade_date: string;
  market: string;
  close: number | null;
  change?: number | null;
  change_rate?: number | null;
  volume?: number | null;
  trading_value_million_krw?: number | null;
  ma20?: number | null;
  ma60?: number | null;
};

export type InvestorFlowDaily = {
  trade_date: string;
  market: string;
  foreign_net_buy: number | null;
  institution_net_buy: number | null;
  individual_net_buy: number | null;
  program_net_buy?: number | null;
};

export type MarketCapDaily = {
  trade_date: string;
  market: "KOSPI" | "KOSDAQ" | string;
  market_cap_million_krw: number | null;
  listed_stock_count?: number | null;
};

export type SignalEventInput = {
  trade_date: string;
  signal_type: string;
  severity: SignalSeverity;
  score_delta: number;
  title: string;
  description: string;
};

export type MarketRiskDailyInput = {
  trade_date: string;
  liquidity_score: number;
  leverage_score: number;
  cma_score: number;
  flow_score: number;
  technical_score: number;
  total_score: number;
  risk_level: RiskLevel;
  summary: string;
};

export type MarketRiskCalculationResult = {
  risks: MarketRiskDailyInput[];
  signals: SignalEventInput[];
};
