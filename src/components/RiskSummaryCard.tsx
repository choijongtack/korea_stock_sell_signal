import type { RiskLevel } from "@/types/market";

export const riskLevelLabel: Record<RiskLevel, string> = {
  stable: "안정",
  caution: "주의",
  warning: "경고",
  danger: "위험",
  crisis: "위기"
};

interface RiskSummaryCardProps {
  totalScore: number;
  riskLevel: RiskLevel;
  summary?: string | null;
}

export function RiskSummaryCard({ totalScore, riskLevel, summary }: RiskSummaryCardProps) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-slate-500">Market Risk Score</p>
        <details className="relative">
          <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
            ?
          </summary>
          <div className="absolute left-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg">
            0~19 안정, 20~39 주의, 40~59 경고, 60~84 위험, 85~100 위기 기준으로 계산됩니다.
          </div>
        </details>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <p className="text-5xl font-bold tracking-tight text-slate-900">{totalScore}</p>
        <p className="pb-1 text-lg font-semibold text-slate-700">/ 100</p>
      </div>
      <div className="mt-4 inline-flex rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
        위험 등급: {riskLevelLabel[riskLevel]} ({riskLevel})
      </div>
      {summary && <p className="mt-4 text-sm leading-6 text-slate-700">{summary}</p>}
    </section>
  );
}
