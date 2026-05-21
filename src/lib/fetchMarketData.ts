import "server-only";
import { getSupabaseReadClient } from "./supabaseAdmin";
import type { InvestorFlowDaily, MarketCmaDaily, MarketCreditBalanceDaily, MarketIndexDaily, MarketLiquidityDaily, MarketRiskScore, SignalEvent } from "@/types/market";

export async function fetchMarketLiquidityDaily(): Promise<MarketLiquidityDaily[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }
  const { data, error } = await supabase.from("market_liquidity_daily").select("*").order("trade_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch market_liquidity_daily:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    tradeDate: row.trade_date,
    investorDepositMillionKrw: row.investor_deposit_million_krw,
    derivativesDepositMillionKrw: row.derivatives_deposit_million_krw,
    rpBalanceMillionKrw: row.rp_balance_million_krw,
    unsettledBalanceMillionKrw: row.unsettled_balance_million_krw,
    createdAt: row.created_at ?? new Date().toISOString()
  }));
}

export async function fetchMarketIndexDaily(): Promise<MarketIndexDaily[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }
  const { data, error } = await supabase.from("market_index_daily").select("*").order("trade_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch market_index_daily:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    tradeDate: row.trade_date,
    market: row.market,
    close: row.close,
    change: row.change,
    changeRate: row.change_rate,
    open: row.open,
    high: row.high,
    low: row.low,
    volume: row.volume,
    tradingValueMillionKrw: row.trading_value_million_krw,
    createdAt: row.created_at ?? new Date().toISOString()
  }));
}

export async function fetchInvestorFlowDaily(): Promise<InvestorFlowDaily[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }

  const wide = await supabase
    .from("investor_flow_daily")
    .select("trade_date,market,foreign_net_buy,institution_net_buy,individual_net_buy,program_net_buy,created_at")
    .order("trade_date", { ascending: true });

  if (!wide.error) {
    return (wide.data ?? []).map((row) => ({
      tradeDate: row.trade_date,
      market: row.market,
      foreignNetBuy: row.foreign_net_buy,
      institutionNetBuy: row.institution_net_buy,
      individualNetBuy: row.individual_net_buy,
      programNetBuy: row.program_net_buy,
      createdAt: row.created_at ?? new Date().toISOString()
    }));
  }

  console.error("Failed to fetch investor_flow_daily:", wide.error.message);
  return [];
}

export async function fetchMarketCreditBalanceDaily(): Promise<MarketCreditBalanceDaily[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }
  const { data, error } = await supabase.from("market_credit_balance_daily").select("*").order("trade_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch market_credit_balance_daily:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    tradeDate: row.trade_date,
    creditLoanMillionKrw: row.credit_loan_million_krw,
    creditShortMillionKrw: row.credit_short_million_krw,
    collateralLoanMillionKrw: row.collateral_loan_million_krw,
    totalCreditMillionKrw: row.total_credit_million_krw,
    createdAt: row.created_at ?? new Date().toISOString()
  }));
}

export async function fetchMarketCmaDaily(): Promise<MarketCmaDaily[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }
  const { data, error } = await supabase.from("market_cma_daily").select("*").order("trade_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch market_cma_daily:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    tradeDate: row.trade_date,
    rpTypeMillionKrw: row.rp_type_million_krw,
    mmfTypeMillionKrw: row.mmf_type_million_krw,
    jonggeumTypeMillionKrw: row.jonggeum_type_million_krw,
    issuingNoteTypeMillionKrw: row.issuing_note_type_million_krw,
    otherTypeMillionKrw: row.other_type_million_krw,
    totalMillionKrw: row.total_million_krw,
    createdAt: row.created_at ?? new Date().toISOString()
  }));
}

export async function fetchLatestMarketRiskDaily(): Promise<
  (Pick<MarketRiskScore, "tradeDate" | "totalScore" | "riskLevel" | "liquidityScore" | "leverageScore" | "flowScore" | "technicalScore"> & {
    cmaScore?: number;
    summary?: string | null;
  }) | null
> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return null;
  }
  const { data, error } = await supabase
    .from("market_risk_daily")
    .select("trade_date,total_score,risk_level,liquidity_score,leverage_score,flow_score,technical_score,cma_score,summary")
    .order("trade_date", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Failed to fetch market_risk_daily latest row:", error.message);
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    tradeDate: row.trade_date,
    liquidityScore: row.liquidity_score ?? 0,
    leverageScore: row.leverage_score ?? 0,
    flowScore: row.flow_score ?? 0,
    technicalScore: row.technical_score ?? 0,
    cmaScore: row.cma_score ?? 0,
    totalScore: row.total_score ?? 0,
    riskLevel: row.risk_level ?? "stable",
    summary: row.summary ?? null
  };
}

export async function fetchLatestSignalEvents(): Promise<SignalEvent[]> {
  let supabase;
  try {
    supabase = getSupabaseReadClient();
  } catch (error) {
    console.error(error);
    return [];
  }
  const latestDateRes = await supabase
    .from("signal_events")
    .select("trade_date")
    .order("trade_date", { ascending: false })
    .limit(1);

  if (latestDateRes.error) {
    console.error("Failed to fetch signal_events latest date:", latestDateRes.error.message);
    return [];
  }

  const latestDate = latestDateRes.data?.[0]?.trade_date;
  if (!latestDate) return [];

  const eventsRes = await supabase
    .from("signal_events")
    .select("*")
    .eq("trade_date", latestDate);

  if (eventsRes.error) {
    console.error("Failed to fetch signal_events by latest date:", eventsRes.error.message);
    return [];
  }

  const rows = [...(eventsRes.data ?? [])].sort((a, b) => {
    const av = typeof a.created_at === "string" ? a.created_at : "";
    const bv = typeof b.created_at === "string" ? b.created_at : "";
    return av.localeCompare(bv);
  });

  return rows.map((row) => ({
    tradeDate: row.trade_date,
    ticker: row.ticker ?? "MARKET",
    signalType: row.signal_type ?? "hold",
    triggerScore: row.trigger_score ?? row.score_delta ?? 0,
    triggerReason: row.trigger_reason ?? row.description ?? row.title ?? "신호 설명 없음",
    createdAt: row.created_at ?? new Date().toISOString()
  }));
}
