import { AppLayout } from "@/components/AppLayout";
import { RiskAiReport } from "@/components/RiskAiReport";
import { RiskSummaryCard } from "@/components/RiskSummaryCard";
import { SignalChecklist } from "@/components/SignalChecklist";
import { generateRiskReport } from "@/lib/aiRiskReport";
import { fetchLatestIndexTradeDate, fetchLatestMarketRiskDaily, fetchLatestSignalEvents } from "@/lib/fetchMarketData";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const latestRisk = await fetchLatestMarketRiskDaily();
  const latestSignals = await fetchLatestSignalEvents();
  const latestIndexTradeDate = await fetchLatestIndexTradeDate("KOSPI");
  const risk = latestRisk ?? {
    tradeDate: null,
    totalScore: 0,
    riskLevel: "stable" as const,
    liquidityScore: 0,
    leverageScore: 0,
    flowScore: 0,
    technicalScore: 0,
    cmaScore: 0,
    summary: "저장된 위험 점수 데이터가 없습니다."
  };
  const report = await generateRiskReport({ ...risk, signals: latestSignals, reportVersionDate: latestIndexTradeDate });

  return (
    <AppLayout title="시그널" description="저장된 최신 위험 점수와 신호를 확인합니다.">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <RiskSummaryCard totalScore={risk.totalScore} riskLevel={risk.riskLevel} summary={risk.summary ?? null} />
          <SignalChecklist signals={latestSignals} />
        </div>
        <RiskAiReport report={report} />
      </div>
    </AppLayout>
  );
}
