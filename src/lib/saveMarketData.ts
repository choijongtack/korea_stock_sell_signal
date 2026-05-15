import { supabase } from "@/lib/supabaseClient";
import type { InvestorFlowDaily, MarketCmaDaily, MarketCreditBalanceDaily, MarketIndexDaily, MarketLiquidityDaily } from "@/types/market";

type SaveResult = { success: true; count: number } | { success: false; message: string };
type PartialMarketLiquidityDaily = Pick<MarketLiquidityDaily, "tradeDate" | "createdAt"> &
  Partial<Omit<MarketLiquidityDaily, "tradeDate" | "createdAt">>;

const hasKeys = (row: Record<string, unknown>, required: string[]): boolean => required.every((key) => key in row);

export async function upsertMarketLiquidityDaily(rows: MarketLiquidityDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No liquidity rows to save." };

  const payload = rows.map((r) => ({
    trade_date: r.tradeDate,
    investor_deposit_million_krw: r.investorDepositMillionKrw,
    derivatives_deposit_million_krw: r.derivativesDepositMillionKrw,
    rp_balance_million_krw: r.rpBalanceMillionKrw,
    unsettled_balance_million_krw: r.unsettledBalanceMillionKrw,
    created_at: r.createdAt
  }));

  if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for market_liquidity_daily." };
  }

  const { error } = await supabase.from("market_liquidity_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}

export async function upsertMarketLiquidityDailyPartial(rows: PartialMarketLiquidityDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No liquidity rows to save." };

  const payload = rows.map((r) => {
    const row: Record<string, unknown> = {
      trade_date: r.tradeDate,
      created_at: r.createdAt
    };

    if (r.investorDepositMillionKrw !== undefined) row.investor_deposit_million_krw = r.investorDepositMillionKrw;
    if (r.derivativesDepositMillionKrw !== undefined) row.derivatives_deposit_million_krw = r.derivativesDepositMillionKrw;
    if (r.rpBalanceMillionKrw !== undefined) row.rp_balance_million_krw = r.rpBalanceMillionKrw;
    if (r.unsettledBalanceMillionKrw !== undefined) row.unsettled_balance_million_krw = r.unsettledBalanceMillionKrw;

    return row;
  });

  if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for market_liquidity_daily." };
  }

  const { error } = await supabase.from("market_liquidity_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}

export async function upsertMarketCreditBalanceDaily(rows: MarketCreditBalanceDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No credit balance rows to save." };

  const payload = rows.map((r) => ({
    trade_date: r.tradeDate,
    credit_loan_million_krw: r.creditLoanMillionKrw,
    credit_short_million_krw: r.creditShortMillionKrw,
    collateral_loan_million_krw: r.collateralLoanMillionKrw,
    total_credit_million_krw: r.totalCreditMillionKrw,
    created_at: r.createdAt
  }));

  if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for market_credit_balance_daily." };
  }

  const { error } = await supabase.from("market_credit_balance_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}

export async function upsertMarketIndexDaily(rows: MarketIndexDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No index rows to save." };

  const payload = rows.map((r) => ({
    trade_date: r.tradeDate,
    market: r.market,
    close: r.close,
    change: r.change,
    change_rate: r.changeRate,
    open: r.open,
    high: r.high,
    low: r.low,
    volume: r.volume,
    trading_value_million_krw: r.tradingValueMillionKrw,
    created_at: r.createdAt
  }));

  if (!payload.every((row) => hasKeys(row, ["trade_date", "market", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for market_index_daily." };
  }

  const { error } = await supabase.from("market_index_daily").upsert(payload, { onConflict: "trade_date,market" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}

export async function upsertInvestorFlowDaily(rows: InvestorFlowDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No investor flow rows to save." };

  const payload = rows.map((r) => ({
    trade_date: r.tradeDate,
    foreign_net_buy: r.foreignNetBuy,
    institution_net_buy: r.institutionNetBuy,
    individual_net_buy: r.individualNetBuy,
    program_net_buy: r.programNetBuy,
    created_at: r.createdAt
  }));

  if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for investor_flow_daily." };
  }

  const { error } = await supabase.from("investor_flow_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}

export async function upsertMarketCmaDaily(rows: MarketCmaDaily[]): Promise<SaveResult> {
  if (rows.length === 0) return { success: false, message: "No CMA rows to save." };

  const payload = rows.map((r) => ({
    trade_date: r.tradeDate,
    rp_type_million_krw: r.rpTypeMillionKrw,
    mmf_type_million_krw: r.mmfTypeMillionKrw,
    jonggeum_type_million_krw: r.jonggeumTypeMillionKrw,
    issuing_note_type_million_krw: r.issuingNoteTypeMillionKrw,
    other_type_million_krw: r.otherTypeMillionKrw,
    total_million_krw: r.totalMillionKrw,
    created_at: r.createdAt
  }));

  if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
    return { success: false, message: "Validation failed: required columns are missing for market_cma_daily." };
  }

  const { error } = await supabase.from("market_cma_daily").upsert(payload, { onConflict: "trade_date" });
  if (error) return { success: false, message: error.message };
  return { success: true, count: payload.length };
}
