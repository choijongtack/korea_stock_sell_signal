export type MarketType = "KOSPI" | "KOSDAQ";

export type RiskLevel = "safe" | "caution" | "danger";

export type HoldingStock = {
  id?: string;
  user_id?: string;
  stock_code: string;
  stock_name: string;
  market: MarketType;
  buy_price: number;
  current_price: number;
  quantity: number;
  buy_date?: string;
};

export type StockRiskSignal = {
  signal_type: string;
  severity: RiskLevel;
  score_delta: number;
  title: string;
  description: string;
};

export type StockRiskResult = {
  stock_code: string;
  stock_name: string;
  market: MarketType;
  profit_rate: number;
  loss_amount: number;
  valuation_amount: number;
  risk_score: number;
  risk_level: RiskLevel;
  signals: StockRiskSignal[];
  recommendation: string;
};
