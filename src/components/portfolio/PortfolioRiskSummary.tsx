import type { StockRiskResult } from "@/types/portfolioRisk";

type PortfolioRiskSummaryProps = {
  results: StockRiskResult[];
};

export function PortfolioRiskSummary({ results }: PortfolioRiskSummaryProps) {
  const total = results.length;
  const danger = results.filter((r) => r.risk_level === "danger").length;
  const caution = results.filter((r) => r.risk_level === "caution").length;
  const safe = results.filter((r) => r.risk_level === "safe").length;
  const avgScore = total === 0 ? 0 : Math.round(results.reduce((sum, r) => sum + r.risk_score, 0) / total);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">포트폴리오 위험 요약</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">총 종목</p><p className="text-lg font-semibold">{total}</p></div>
        <div className="rounded-lg bg-rose-50 p-3"><p className="text-rose-600">danger</p><p className="text-lg font-semibold text-rose-700">{danger}</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-amber-600">caution</p><p className="text-lg font-semibold text-amber-700">{caution}</p></div>
        <div className="rounded-lg bg-emerald-50 p-3"><p className="text-emerald-600">safe</p><p className="text-lg font-semibold text-emerald-700">{safe}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">평균 점수</p><p className="text-lg font-semibold">{avgScore}</p></div>
      </div>
    </section>
  );
}
