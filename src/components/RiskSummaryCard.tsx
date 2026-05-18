import { AlertTriangle, Info } from "lucide-react";
import type { RiskLevel } from "@/types/market";

export const riskLevelLabel: Record<RiskLevel, string> = {
  stable: "안정",
  caution: "주의",
  warning: "경고",
  danger: "위험",
  crisis: "위기"
};

const riskLevelTone: Record<RiskLevel, { badge: string; bar: string; panel: string }> = {
  stable: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    bar: "bg-emerald-500",
    panel: "from-emerald-50 to-white"
  },
  caution: {
    badge: "bg-lime-50 text-lime-700 ring-lime-200",
    bar: "bg-lime-500",
    panel: "from-lime-50 to-white"
  },
  warning: {
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    bar: "bg-amber-500",
    panel: "from-amber-50 to-white"
  },
  danger: {
    badge: "bg-orange-50 text-orange-800 ring-orange-200",
    bar: "bg-orange-500",
    panel: "from-orange-50 to-white"
  },
  crisis: {
    badge: "bg-red-50 text-red-700 ring-red-200",
    bar: "bg-red-500",
    panel: "from-red-50 to-white"
  }
};

interface RiskSummaryCardProps {
  totalScore: number;
  riskLevel: RiskLevel;
  summary?: string | null;
}

export function RiskSummaryCard({ totalScore, riskLevel, summary }: RiskSummaryCardProps) {
  const tone = riskLevelTone[riskLevel];
  const progress = Math.max(0, Math.min(100, totalScore));

  return (
    <section className={`rounded-xl border border-slate-200 bg-gradient-to-br ${tone.panel} p-5 shadow-sm sm:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Market Risk Score</p>
            <p className="text-xs text-slate-500">종합 매도 위험도</p>
          </div>
        </div>
        <details className="relative">
          <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900">
            <Info className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg">
            0~19 안정, 20~39 주의, 40~59 경고, 60~84 위험, 85~100 위기 기준으로 계산됩니다.
          </div>
        </details>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <p className="text-6xl font-bold tracking-tight text-slate-950">{totalScore}</p>
          <p className="pb-2 text-lg font-semibold text-slate-600">/ 100</p>
        </div>
        <div className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${tone.badge}`}>
          {riskLevelLabel[riskLevel]} ({riskLevel})
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${progress}%` }} />
      </div>

      {summary && <p className="mt-4 text-sm leading-6 text-slate-700">{summary}</p>}
    </section>
  );
}
