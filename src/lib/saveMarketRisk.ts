import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildMarketRiskSeries } from "@/lib/calculateMarketRisk";
import type {
  InvestorFlowDaily,
  MarketCmaDaily,
  MarketCreditBalanceDaily,
  MarketIndexDaily,
  MarketLiquidityDaily
} from "@/types/market";
import type {
  CmaDailyRow,
  CreditBalanceDailyRow,
  InvestorFlowDailyRow,
  MarketIndexDailyRow,
  MarketLiquidityDailyRow,
  MarketRiskDailyDbInput,
  SignalEventDbInput
} from "@/types/riskInput";
import type { MarketRiskDailyInput, SignalEventInput } from "@/types/risk";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchFromCandidates<T>(candidates: string[], selectClause: string, cutoff: string): Promise<T[]> {
  const supabaseAdmin = getSupabaseAdmin();
  for (const table of candidates) {
    const res = await supabaseAdmin.from(table).select(selectClause).gte("trade_date", cutoff).order("trade_date", { ascending: true });
    if (!res.error) return (res.data ?? []) as T[];
  }
  return [];
}

export async function saveMarketRiskForLastMonths(months = 6): Promise<{ riskRows: number; signalRows: number }> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoff = toIsoDate(cutoffDate);

  const [liquidityRaw, creditRaw, cmaRaw, indexRaw, flowRaw] = await Promise.all([
    fetchFromCandidates<MarketLiquidityDailyRow>(["market_liquidity_daily"], "*", cutoff),
    fetchFromCandidates<CreditBalanceDailyRow>(["market_credit_balance_daily"], "*", cutoff),
    fetchFromCandidates<CmaDailyRow>(["market_cma_daily"], "*", cutoff),
    fetchFromCandidates<MarketIndexDailyRow>(["market_index_daily"], "*", cutoff),
    fetchFromCandidates<InvestorFlowDailyRow>(["investor_flow_daily"], "*", cutoff)
  ]);

  const liquidityRows: MarketLiquidityDaily[] = liquidityRaw.map((row) => ({
    tradeDate: row.trade_date,
    investorDepositMillionKrw: row.investor_deposit_million_krw,
    derivativesDepositMillionKrw: row.derivatives_deposit_million_krw ?? null,
    rpBalanceMillionKrw: row.rp_balance_million_krw ?? null,
    unsettledBalanceMillionKrw: row.unsettled_balance_million_krw ?? null,
    createdAt: row.created_at ?? new Date().toISOString()
  }));

  const creditRows: MarketCreditBalanceDaily[] = creditRaw.map((row) => ({
    tradeDate: row.trade_date,
    creditLoanMillionKrw: row.credit_loan_million_krw,
    creditShortMillionKrw: row.credit_short_million_krw ?? null,
    collateralLoanMillionKrw: row.collateral_loan_million_krw ?? null,
    totalCreditMillionKrw: row.total_credit_million_krw ?? null,
    createdAt: row.created_at ?? new Date().toISOString()
  }));

  const cmaRows: MarketCmaDaily[] = cmaRaw.map((row) => ({
    tradeDate: row.trade_date,
    rpTypeMillionKrw: row.rp_type_million_krw ?? null,
    mmfTypeMillionKrw: row.mmf_type_million_krw ?? null,
    jonggeumTypeMillionKrw: row.jonggeum_type_million_krw ?? null,
    issuingNoteTypeMillionKrw: row.issuing_note_type_million_krw ?? null,
    otherTypeMillionKrw: row.other_type_million_krw ?? null,
    totalMillionKrw: row.total_million_krw ?? row.cma_balance_million_krw ?? null,
    createdAt: row.created_at ?? new Date().toISOString()
  }));

  const indexRows: MarketIndexDaily[] = indexRaw.map((row) => ({
    tradeDate: row.trade_date,
    market: row.market,
    close: row.close,
    change: row.change ?? null,
    changeRate: row.change_rate ?? null,
    open: row.open ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    volume: row.volume ?? null,
    tradingValueMillionKrw: row.trading_value_million_krw ?? null,
    createdAt: row.created_at ?? new Date().toISOString()
  }));

  const flowRows: InvestorFlowDaily[] = flowRaw.map((row) => ({
    tradeDate: row.trade_date,
    market: row.market,
    foreignNetBuy: row.foreign_net_buy ?? row.net_buy_amount_million_krw ?? null,
    institutionNetBuy: row.institution_net_buy ?? null,
    individualNetBuy: row.individual_net_buy ?? null,
    programNetBuy: row.program_net_buy ?? null,
    createdAt: row.created_at ?? new Date().toISOString()
  }));

  const results = buildMarketRiskSeries({
    liquidityRows,
    creditRows,
    cmaRows,
    indexRows,
    flowRows
  });

  const riskPayload: MarketRiskDailyDbInput[] = results.map((row) => ({
    trade_date: row.tradeDate,
    liquidity_score: row.liquidityScore,
    leverage_score: row.leverageScore,
    flow_score: row.flowScore,
    technical_score: row.technicalScore,
    market_breadth_score: row.marketBreadthScore,
    macro_score: row.macroScore,
    total_score: row.totalScore,
    risk_level: row.riskLevel,
    created_at: row.createdAt
  }));

  const signalPayload: SignalEventDbInput[] = results.flatMap((row) =>
    row.signals.map((signal) => ({
      trade_date: signal.tradeDate,
      ticker: signal.ticker,
      signal_type: signal.signalType,
      trigger_score: signal.triggerScore,
      trigger_reason: signal.triggerReason,
      created_at: signal.createdAt
    }))
  );

  const supabaseAdmin = getSupabaseAdmin();

  if (riskPayload.length > 0) {
    const riskSave = await supabaseAdmin.from("market_risk_daily").upsert(riskPayload, { onConflict: "trade_date" });
    if (riskSave.error) throw new Error(`Failed to upsert market_risk_daily: ${riskSave.error.message}`);
  }

  const riskDates = results.map((row) => row.tradeDate);
  if (riskDates.length > 0) {
    const deleteEvents = await supabaseAdmin.from("signal_events").delete().in("trade_date", riskDates);
    if (deleteEvents.error) throw new Error(`Failed to delete signal_events: ${deleteEvents.error.message}`);
  }

  if (signalPayload.length > 0) {
    const insertEvents = await supabaseAdmin.from("signal_events").insert(signalPayload);
    if (insertEvents.error) throw new Error(`Failed to insert signal_events: ${insertEvents.error.message}`);
  }

  return { riskRows: riskPayload.length, signalRows: signalPayload.length };
}

export async function saveMarketRiskResults(params: {
  risks: MarketRiskDailyInput[];
  signals: SignalEventInput[];
}) {
  const { risks, signals } = params;
  const supabaseAdmin = getSupabaseAdmin();

  if (risks.length === 0) {
    return {
      riskCount: 0,
      signalCount: 0
    };
  }

  const { error: riskError } = await supabaseAdmin
    .from("market_risk_daily")
    .upsert(
      risks.map((risk) => ({
        ...risk,
        updated_at: new Date().toISOString()
      })),
      { onConflict: "trade_date" }
    );

  if (riskError) {
    throw new Error(`market_risk_daily 저장 실패: ${riskError.message}`);
  }

  const dates = [...new Set(risks.map((risk) => risk.trade_date))];

  const { error: deleteError } = await supabaseAdmin
    .from("signal_events")
    .delete()
    .in("trade_date", dates);

  if (deleteError) {
    throw new Error(`기존 signal_events 삭제 실패: ${deleteError.message}`);
  }

  if (signals.length > 0) {
    const { error: signalError } = await supabaseAdmin.from("signal_events").insert(signals);

    if (signalError) {
      throw new Error(`signal_events 저장 실패: ${signalError.message}`);
    }
  }

  return {
    riskCount: risks.length,
    signalCount: signals.length
  };
}
