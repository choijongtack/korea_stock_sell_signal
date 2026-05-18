import { CheckCircle2, ListChecks } from "lucide-react";
import type { SignalEvent } from "@/types/market";

interface SignalChecklistProps {
  signals: SignalEvent[];
}

export function SignalChecklist({ signals }: SignalChecklistProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100">
            <ListChecks className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">발생 신호 체크리스트</h2>
            <p className="text-xs text-slate-500">최근 매도 신호 {signals.length}건</p>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {signals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">현재 발생한 신호가 없습니다.</div>
        ) : (
          signals.map((signal, index) => (
            <div key={`${signal.tradeDate}-${index}`} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{signal.tradeDate}</p>
                <p className="mt-1 text-sm leading-5 text-slate-800">{signal.triggerReason}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
