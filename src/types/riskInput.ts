import type { RiskLevel } from "@/types/risk";

export type SignalSeverity = "info" | "caution" | "warning" | "danger" | "crisis";

export type MarketLiquidityDailyRow = {
  trade_date: string;
  investor_deposit_million_krw: number | null;
  derivatives_deposit_million_krw?: number | null;
  rp_balance_million_krw?: number | null;
  unsettled_balance_million_krw?: number | null;
  created_at?: string | null;
};

export type CreditBalanceDailyRow = {
  trade_date: string;
  credit_loan_million_krw: number | null;
  credit_short_million_krw?: number | null;
  collateral_loan_million_krw?: number | null;
  total_credit_million_krw?: number | null;
  created_at?: string | null;
};

export type CmaDailyRow = {
  trade_date: string;
  cma_balance_million_krw?: number | null;
  total_million_krw?: number | null;
  cma_account_count?: number | null;
  rp_type_million_krw?: number | null;
  mmf_type_million_krw?: number | null;
  jonggeum_type_million_krw?: number | null;
  issuing_note_type_million_krw?: number | null;
  other_type_million_krw?: number | null;
  created_at?: string | null;
};

export type MarketIndexDailyRow = {
  trade_date: string;
  market: string;
  close: number | null;
  change?: number | null;
  change_rate?: number | null;
  volume?: number | null;
  trading_value_million_krw?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  created_at?: string | null;
};

export type InvestorFlowDailyRow = {
  trade_date: string;
  market: string;
  investor_type?: string;
  net_buy_amount_million_krw?: number | null;
  foreign_net_buy?: number | null;
  institution_net_buy?: number | null;
  individual_net_buy?: number | null;
  program_net_buy?: number | null;
  created_at?: string | null;
};

export type MarketCapDailyRow = {
  trade_date: string;
  market: string;
  market_cap_million_krw: number | null;
  listed_stock_count?: number | null;
  created_at?: string | null;
};

export type SignalEventDbInput = {
  trade_date: string;
  ticker: string;
  signal_type: string;
  trigger_score: number;
  trigger_reason: string;
  created_at: string;
};

export type MarketRiskDailyDbInput = {
  trade_date: string;
  liquidity_score: number;
  leverage_score: number;
  flow_score: number;
  technical_score: number;
  market_breadth_score: number;
  macro_score: number;
  total_score: number;
  risk_level: RiskLevel;
  created_at: string;
};
