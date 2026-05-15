import type { StockRiskResult } from "@/types/portfolioRisk";

type HoldingRiskCardProps = {
  result: StockRiskResult;
};

const badgeByLevel: Record<StockRiskResult["risk_level"], string> = {
  safe: "bg-emerald-100 text-emerald-800",
  caution: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-800"
};

export function HoldingRiskCard({ result }: HoldingRiskCardProps) {
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{result.stock_name}</h3>
          <p className="text-xs text-slate-500">{result.stock_code} · {result.market}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeByLevel[result.risk_level]}`}>
          {result.risk_level}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">수익률</dt>
          <dd className="font-medium">{result.profit_rate.toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">위험점수</dt>
          <dd className="font-medium">{result.risk_score}</dd>
        </div>
        <div>
          <dt className="text-slate-500">평가금액</dt>
          <dd className="font-medium">{result.valuation_amount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">손익금액</dt>
          <dd className="font-medium">{result.loss_amount.toLocaleString()}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{result.recommendation}</p>

      {result.signals.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {result.signals.slice(0, 3).map((signal) => (
            <li key={`${result.stock_code}-${signal.signal_type}-${signal.title}`}>
              • {signal.title}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
