import { AppLayout } from "@/components/AppLayout";
import { RiskSummaryCard } from "@/components/RiskSummaryCard";
import { SignalChecklist } from "@/components/SignalChecklist";
import { fetchLatestMarketRiskDaily, fetchLatestSignalEvents } from "@/lib/fetchMarketData";

export default async function SignalsPage() {
  const latestRisk = await fetchLatestMarketRiskDaily();
  const latestSignals = await fetchLatestSignalEvents();
  const risk = latestRisk ?? { totalScore: 0, riskLevel: "stable" as const, summary: "저장된 위험 점수 데이터가 없습니다." };

  return (
    <AppLayout title="시그널" description="저장된 최신 위험 점수와 신호를 확인합니다.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <RiskSummaryCard totalScore={risk.totalScore} riskLevel={risk.riskLevel} summary={risk.summary ?? null} />
        <SignalChecklist signals={latestSignals} />
      </div>
    </AppLayout>
  );
}
