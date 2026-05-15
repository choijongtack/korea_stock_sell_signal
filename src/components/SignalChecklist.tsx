import type { SignalEvent } from "@/types/market";

interface SignalChecklistProps {
  signals: SignalEvent[];
}

export function SignalChecklist({ signals }: SignalChecklistProps) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">발생 신호 체크리스트</h2>
      <div className="mt-4 space-y-3">
        {signals.length === 0 ? (
          <p className="text-sm text-slate-500">현재 발생한 신호가 없습니다.</p>
        ) : (
          signals.map((signal, index) => (
            <label key={`${signal.tradeDate}-${index}`} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
              <input type="checkbox" checked readOnly className="mt-1 h-4 w-4 accent-slate-900" />
              <span className="text-sm text-slate-700">
                <strong className="text-slate-900">{signal.tradeDate}</strong> - {signal.triggerReason}
              </span>
            </label>
          ))
        )}
      </div>
    </section>
  );
}
