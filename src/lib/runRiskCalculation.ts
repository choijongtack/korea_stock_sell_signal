import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateMarketRiskEngine } from "@/lib/calculateMarketRisk";
import { saveMarketRiskResults } from "@/lib/saveMarketRisk";
import type {
  CmaDaily,
  CreditBalanceDaily,
  InvestorFlowDaily,
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

export async function runRiskCalculation(options: { debug?: boolean } = {}) {
  const [liquidityResult, creditResult, cmaResult, indexResult, flowResult] = await Promise.all([
    selectFromCandidates(["market_liquidity_daily"]),
    selectFromCandidates(["market_credit_balance_daily"]),
    selectFromCandidates(["market_cma_daily"]),
    selectFromCandidates(["market_index_daily"]),
    selectFromCandidates(["investor_flow_daily"])
  ]);

  const result = calculateMarketRiskEngine({
    liquidityRows: (liquidityResult.data ?? []) as MarketLiquidityDaily[],
    creditRows: (creditResult.data ?? []) as CreditBalanceDaily[],
    cmaRows: (cmaResult.data ?? []) as CmaDaily[],
    indexRows: (indexResult.data ?? []) as MarketIndexDaily[],
    flowRows: (flowResult.data ?? []) as InvestorFlowDaily[],
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
