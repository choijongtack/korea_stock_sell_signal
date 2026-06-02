import { AlertCircle, CheckCircle2, ListChecks } from "lucide-react";
import { summarizeSignalGroups } from "@/lib/signalAnalysis";
import type { SignalEvent } from "@/types/market";

interface SignalChecklistProps {
  signals: SignalEvent[];
}

export function SignalChecklist({ signals }: SignalChecklistProps) {
  const groups = summarizeSignalGroups(signals);
  const latestDate = signals[0]?.tradeDate ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100">
            <ListChecks className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">발생 신호 분석</h2>
            <p className="text-xs text-slate-500">
              {latestDate ? `${latestDate} 기준 ${groups.length}개 영역, 원 신호 ${signals.length}건` : "최근 매도 신호"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">현재 발생한 신호가 없습니다.</div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      원 신호 {group.signalCount}건
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{group.summary}</p>
                </div>
              </div>

              {group.details.length > 1 && (
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                  {group.details.map((detail) => (
                    <div key={detail} className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
