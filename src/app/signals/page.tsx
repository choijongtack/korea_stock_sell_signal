import { AppLayout } from "@/components/AppLayout";
import { RiskSummaryCard } from "@/components/RiskSummaryCard";
import { SignalChecklist } from "@/components/SignalChecklist";
import { buildKospiRiskStateSeries } from "@/lib/kospiRiskStateModel";
import {
  fetchInvestorFlowDaily,
  fetchMarketBreadthDaily,
  fetchMarketCapDaily,
  fetchMarketCmaDaily,
  fetchMarketCreditBalanceDaily,
  fetchMarketIndexDaily,
  fetchMarketLiquidityDaily,
  fetchMarketM2Monthly,
  fetchKospiRiskStateDailySeries
} from "@/lib/fetchMarketData";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const [liquidityData, indexData, flowData, creditData, cmaData, breadthData, marketCapData, m2Data, savedRiskSeries] = await Promise.all([
    fetchMarketLiquidityDaily(),
    fetchMarketIndexDaily(),
    fetchInvestorFlowDaily(),
    fetchMarketCreditBalanceDaily(),
    fetchMarketCmaDaily(),
    fetchMarketBreadthDaily(),
    fetchMarketCapDaily(),
    fetchMarketM2Monthly(),
    fetchKospiRiskStateDailySeries()
  ]);

  const calculatedRiskSeries = buildKospiRiskStateSeries({
    liquidityRows: liquidityData,
    creditRows: creditData,
    cmaRows: cmaData,
    indexRows: indexData,
    flowRows: flowData,
    breadthRows: breadthData,
    marketCapRows: marketCapData,
    m2Rows: m2Data
  });
  const riskSeries = savedRiskSeries.length > 0 ? savedRiskSeries : calculatedRiskSeries;
  const latestRisk = riskSeries.at(-1) ?? {
    tradeDate: null,
    totalScore: 0,
    riskLevel: "stable" as const,
    summary: "KOSPI 위험 상태 지수를 계산할 데이터가 아직 부족합니다.",
    components: {}
  };

  return (
    <AppLayout title="위험 신호" description="KOSPI 위험 상태 지수와 최신 구성 요인을 확인합니다.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <RiskSummaryCard totalScore={latestRisk.totalScore} riskLevel={latestRisk.riskLevel} summary={latestRisk.summary ?? null} components={latestRisk.components} showDetails />
        <SignalChecklist riskState={latestRisk} />
      </div>
    </AppLayout>
  );
}
