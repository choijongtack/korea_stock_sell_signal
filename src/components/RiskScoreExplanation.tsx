import { Info } from "lucide-react";
import { buildConditionStatus, buildRawScoreBreakdown, CATEGORY_CAPS } from "@/lib/signalAnalysis";
import type { RiskLevel, SignalEvent } from "@/types/market";

interface RiskScoreExplanationProps {
  risk: {
    totalScore: number;
    riskLevel: RiskLevel;
    liquidityScore?: number;
    leverageScore?: number;
    flowScore?: number;
    technicalScore?: number;
    cmaScore?: number;
  };
  signals: SignalEvent[];
}

const triggeredClass = "bg-rose-50 text-rose-700 ring-rose-100";
const inactiveClass = "bg-slate-50 text-slate-500 ring-slate-200";

export function RiskScoreExplanation({ risk, signals }: RiskScoreExplanationProps) {
  const conditions = buildConditionStatus(signals);
  const raw = buildRawScoreBreakdown(signals);
  const rows = [
    { label: "유동성", raw: raw.liquidity, final: risk.liquidityScore ?? 0, cap: CATEGORY_CAPS.liquidity },
    { label: "레버리지", raw: raw.leverage, final: risk.leverageScore ?? 0, cap: CATEGORY_CAPS.leverage },
    { label: "수급", raw: raw.flow, final: risk.flowScore ?? 0, cap: CATEGORY_CAPS.flow },
    { label: "기술적 추세", raw: raw.technical, final: risk.technicalScore ?? 0, cap: CATEGORY_CAPS.technical },
    { label: "CMA", raw: raw.cma, final: risk.cmaScore ?? 0, cap: CATEGORY_CAPS.cma }
  ];
  const cappedRows = rows.filter((row) => row.raw > row.final);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <Info className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">점수 산정 근거</h2>
          <p className="text-xs text-slate-500">AI 해석 전에 실제 로직으로 계산된 발생/미발생 조건입니다.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">{row.label}</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{row.final}점</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              원 신호 합계 {row.raw}점, 상한 {row.cap}점
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {conditions.map((condition) => (
          <div
            key={condition.code}
            className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${condition.triggered ? triggeredClass : inactiveClass}`}
          >
            {condition.triggered ? "발생" : "미발생"} · {condition.label}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
        <p>
          같은 신용융자/예탁금 비율이라도 한 번은 <span className="font-semibold text-slate-950">유동성 질</span>을, 한 번은{" "}
          <span className="font-semibold text-slate-950">레버리지 부담</span>을 평가합니다. 그래서 같은 지표가 서로 다른 카테고리에 반영될 수 있습니다.
        </p>
        {cappedRows.length > 0 && (
          <p>
            카테고리 상한이 적용되어 {cappedRows.map((row) => `${row.label} 원 신호 ${row.raw}점 -> 실제 ${row.final}점`).join(", ")}으로 제한됐습니다.
          </p>
        )}
      </div>
    </section>
  );
}
