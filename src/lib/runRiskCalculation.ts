import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateMarketRiskEngine } from "@/lib/calculateMarketRisk";
import { saveMarketRiskResults } from "@/lib/saveMarketRisk";
import type {
  CmaDaily,
  CreditBalanceDaily,
  InvestorFlowDaily,
  MarketCapDaily,
  MarketIndexDaily,
  MarketLiquidityDaily
} from "@/types/risk";

async function selectFromCandidates(tables: string[]) {
  const supabase = getSupabaseAdmin();
  let lastErrorMessage = "Unknown error";

  for (const table of tables) {
    const result = await supabase.from(table).select("*").order("trade_date", { ascending: true });
    if (!result.error) return result;
    lastErrorMessage = result.error.message;
  }

  throw new Error(lastErrorMessage);
}

async function selectOptionalFromCandidates(tables: string[]) {
  const supabase = getSupabaseAdmin();

  for (const table of tables) {
    const result = await supabase.from(table).select("*").order("trade_date", { ascending: true });
    if (!result.error) return result;
  }

  return { data: [], error: null };
}

export async function runRiskCalculation(options: { debug?: boolean } = {}) {
  const [liquidityResult, creditResult, cmaResult, indexResult, flowResult, marketCapResult] = await Promise.all([
    selectFromCandidates(["market_liquidity_daily"]),
    selectFromCandidates(["market_credit_balance_daily"]),
    selectFromCandidates(["market_cma_daily"]),
    selectFromCandidates(["market_index_daily"]),
    selectFromCandidates(["investor_flow_daily"]),
    selectOptionalFromCandidates(["market_cap_daily"])
  ]);

  const result = calculateMarketRiskEngine({
    liquidityRows: (liquidityResult.data ?? []) as MarketLiquidityDaily[],
    creditRows: (creditResult.data ?? []) as CreditBalanceDaily[],
    cmaRows: (cmaResult.data ?? []) as CmaDaily[],
    indexRows: (indexResult.data ?? []) as MarketIndexDaily[],
    flowRows: (flowResult.data ?? []) as InvestorFlowDaily[],
    marketCapRows: (marketCapResult.data ?? []) as MarketCapDaily[],
    debug: options.debug ?? false
  });

  const saved = await saveMarketRiskResults(result);
  const leverageAllZero = result.risks.length > 0 && result.risks.every((risk) => risk.leverage_score === 0);

  return {
    calculatedRiskCount: result.risks.length,
    calculatedSignalCount: result.signals.length,
    saved,
    warning: leverageAllZero ? "모든 거래일의 leverageScore가 0입니다. 신용/수급 데이터 매핑을 점검하세요." : null
  };
}
