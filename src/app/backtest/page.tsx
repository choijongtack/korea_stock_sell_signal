import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { runBacktestValidation } from "@/lib/backtestEngine";

export const dynamic = "force-dynamic";

type ActionFilter = "all" | "buy" | "hold" | "watch" | "reduce" | "sell";
type RiskLevelFilter = "all" | "stable" | "caution" | "warning" | "danger" | "crisis" | "unknown";
type RegimeFilter = "all" | "uptrend" | "neutral" | "downtrend";

function fmt(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function successRate(values: Array<boolean | null>): number | null {
  const filtered = values.filter((v): v is boolean => v !== null);
  if (filtered.length === 0) return null;
  return (filtered.filter(Boolean).length / filtered.length) * 100;
}

function scoreBucket(score: number): "0-39" | "40-59" | "60-74" | "75-84" | "85+" {
  if (score >= 85) return "85+";
  if (score >= 75) return "75-84";
  if (score >= 60) return "60-74";
  if (score >= 40) return "40-59";
  return "0-39";
}

function bucketLabel(bucket: "0-39" | "40-59" | "60-74" | "75-84" | "85+"): string {
  if (bucket === "0-39") return "0~39: low risk / buy zone";
  if (bucket === "40-59") return "40~59: normal / hold zone";
  if (bucket === "60-74") return "60~74: caution / watch zone";
  if (bucket === "75-84") return "75~84: danger / reduce zone";
  return "85+: critical / sell zone";
}

export default async function BacktestPage({
  searchParams
}: {
  searchParams?: Promise<{ from?: string; to?: string; action?: string; risk_level?: string; regime?: string }>;
}) {
  try {
    const result = await runBacktestValidation();
    const params = (await searchParams) ?? {};

    const from = params.from ?? "";
    const to = params.to ?? "";
    const action = (params.action ?? "all") as ActionFilter;
    const riskLevel = (params.risk_level ?? "all") as RiskLevelFilter;
    const regime = (params.regime ?? "all") as RegimeFilter;

    const filteredRows = result.rows.filter((row) => {
      if (from && row.trade_date < from) return false;
      if (to && row.trade_date > to) return false;
      if (action !== "all" && row.action !== action) return false;
      if (riskLevel !== "all" && row.risk_level !== riskLevel) return false;
      if (regime !== "all" && row.market_regime !== regime) return false;
      return true;
    });

    const sellReduceRows = filteredRows.filter((r) => r.action === "sell" || r.action === "reduce");
    const avg5dSellReduce = avg(sellReduceRows.map((r) => r.market_return_5d).filter((v): v is number => v !== null));
    const avg20dSellReduce = avg(sellReduceRows.map((r) => r.market_return_20d).filter((v): v is number => v !== null));
    const success5dSellReduce = successRate(sellReduceRows.map((r) => r.is_success_5d));
    const success20dSellReduce = successRate(sellReduceRows.map((r) => r.is_success_20d));
    const falseSignalRate5d = success5dSellReduce === null ? null : 100 - success5dSellReduce;

    const avgMarketAfterSignal = avg(filteredRows.map((r) => r.market_return_5d).filter((v): v is number => v !== null));
    const avgStrategyAfterSignal = avg(filteredRows.map((r) => r.strategy_return_5d).filter((v): v is number => v !== null));
    const signalSuccessRate = successRate(filteredRows.map((r) => r.is_success_5d));

    const bucketOrder: Array<"0-39" | "40-59" | "60-74" | "75-84" | "85+"> = ["0-39", "40-59", "60-74", "75-84", "85+"];
    const bucketRows = bucketOrder.map((bucket) => {
      const group = filteredRows.filter((r) => scoreBucket(r.score) === bucket);
      return {
        bucket,
        label: bucketLabel(bucket),
        days: group.length,
        avg1d: avg(group.map((r) => r.market_return_1d).filter((v): v is number => v !== null)),
        avg5d: avg(group.map((r) => r.market_return_5d).filter((v): v is number => v !== null)),
        avg10d: avg(group.map((r) => r.market_return_10d).filter((v): v is number => v !== null)),
        avg20d: avg(group.map((r) => r.market_return_20d).filter((v): v is number => v !== null)),
        success5d: successRate(group.map((r) => r.is_success_5d)),
        success20d: successRate(group.map((r) => r.is_success_20d))
      };
    });

    const actionOrder: Array<"buy" | "hold" | "watch" | "reduce" | "sell"> = ["buy", "hold", "watch", "reduce", "sell"];
    const actionRows = actionOrder.map((a) => {
      const group = filteredRows.filter((r) => r.action === a);
      return {
        action: a,
        days: group.length,
        avgMarket5d: avg(group.map((r) => r.market_return_5d).filter((v): v is number => v !== null)),
        avgMarket20d: avg(group.map((r) => r.market_return_20d).filter((v): v is number => v !== null)),
        avgStrategy5d: avg(group.map((r) => r.strategy_return_5d).filter((v): v is number => v !== null)),
        avgStrategy20d: avg(group.map((r) => r.strategy_return_20d).filter((v): v is number => v !== null)),
        success5d: successRate(group.map((r) => r.is_success_5d)),
        success20d: successRate(group.map((r) => r.is_success_20d))
      };
    });

    const queryBase = new URLSearchParams();
    if (from) queryBase.set("from", from);
    if (to) queryBase.set("to", to);
    if (action !== "all") queryBase.set("action", action);
    if (riskLevel !== "all") queryBase.set("risk_level", riskLevel);
    if (regime !== "all") queryBase.set("regime", regime);

    const setFilterHref = (key: string, value: string) => {
      const next = new URLSearchParams(queryBase.toString());
      if (value === "all" || value === "") next.delete(key);
      else next.set(key, value);
      const q = next.toString();
      return q ? `/backtest?${q}` : "/backtest";
    };

    return (
      <AppLayout title="Backtest Validation" description="Risk Score + Signal Type 검증 모듈">
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <div>Action Rule: {result.diagnostics.actionRule}</div>
          <div>Signal rows evaluated: {result.diagnostics.signalEventRows}</div>
          <div>Persisted rows to backtest_results: {result.diagnostics.persistedRows}</div>
          <div>market_return과 strategy_return을 분리해 검증합니다.</div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-semibold text-slate-700">Data Quality Check</div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
            <div>전체 시장 데이터 일수: <span className="font-semibold">{result.diagnostics.totalMarketDays}</span></div>
            <div>market_risk_daily 일수: <span className="font-semibold">{result.diagnostics.marketRiskDays}</span></div>
            <div>매칭된 일수: <span className="font-semibold">{result.diagnostics.matchedDays}</span></div>
            <div>미래 20D 계산 가능 일수: <span className="font-semibold">{result.diagnostics.future20dCalculableDays}</span></div>
            <div>sell/reduce action 발생 일수: <span className="font-semibold">{result.diagnostics.sellReduceDays}</span></div>
            <div>sell/reduce action 비율: <span className="font-semibold">{fmt(result.diagnostics.sellReduceRatioPct)}</span></div>
          </div>
          <div className="mt-2 text-sm text-slate-700">
            120거래일 시장 수익률: <span className="font-semibold">{fmt(result.diagnostics.market120dReturnPct)}</span>
          </div>
          {result.diagnostics.warnings.length > 0 ? (
            <div className="mt-3 space-y-2">
              {result.diagnostics.warnings.map((warning, idx) => (
                <div key={`${warning}-${idx}`} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              데이터 품질 경고 조건에 해당하는 항목이 없습니다.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-semibold text-slate-700">Filters (Risk Score Validation / Raw Rows)</div>
          <div className="grid w-full grid-cols-1 gap-2 text-sm sm:flex sm:flex-wrap">
            <input className="w-full rounded-md border px-2 py-2 sm:w-auto sm:py-1" placeholder="from YYYY-MM-DD" defaultValue={from} name="from" form="filter-form" />
            <input className="w-full rounded-md border px-2 py-2 sm:w-auto sm:py-1" placeholder="to YYYY-MM-DD" defaultValue={to} name="to" form="filter-form" />
            <button form="filter-form" className="rounded-md bg-slate-900 px-3 py-2 text-white sm:py-1">Apply</button>
            <Link className="rounded-md bg-slate-100 px-3 py-2 text-center sm:py-1" href="/backtest">Reset</Link>
          </div>
          <form id="filter-form" action="/backtest" method="get" className="hidden" />

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500">Action:</span>
            {["all", "buy", "hold", "watch", "reduce", "sell"].map((v) => (
              <Link key={v} href={setFilterHref("action", v)} className={`rounded px-2 py-1 ${action === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                {v}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500">Risk Level:</span>
            {["all", "stable", "caution", "warning", "danger", "crisis", "unknown"].map((v) => (
              <Link key={v} href={setFilterHref("risk_level", v)} className={`rounded px-2 py-1 ${riskLevel === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                {v}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500">Regime:</span>
            {["all", "uptrend", "neutral", "downtrend"].map((v) => (
              <Link key={v} href={setFilterHref("regime", v)} className={`rounded px-2 py-1 ${regime === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                {v}
              </Link>
            ))}
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">A. Risk Score Validation</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Total Tested Trading Days</div><div className="mt-1 text-xl font-bold">{filteredRows.length}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Sell/Reduce Action Days</div><div className="mt-1 text-xl font-bold">{sellReduceRows.length}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Avg 5D Market Return after Sell/Reduce</div><div className="mt-1 text-xl font-bold">{fmt(avg5dSellReduce)}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Avg 20D Market Return after Sell/Reduce</div><div className="mt-1 text-xl font-bold">{fmt(avg20dSellReduce)}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Sell/Reduce Success Rate 5D</div><div className="mt-1 text-xl font-bold">{fmt(success5dSellReduce)}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Sell/Reduce Success Rate 20D</div><div className="mt-1 text-xl font-bold">{fmt(success20dSellReduce)}</div></div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Avg Market Return after Signal (5D)</div><div className="mt-1 text-xl font-bold">{fmt(avgMarketAfterSignal)}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Avg Strategy Return (5D)</div><div className="mt-1 text-xl font-bold">{fmt(avgStrategyAfterSignal)}</div></div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs text-slate-500">Signal Success Rate / False Signal Rate (5D)</div><div className="mt-1 text-xl font-bold">{fmt(signalSuccessRate)} / {fmt(falseSignalRate5d)}</div></div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Risk Score Bucket별 Forward Return</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-2 py-2">Bucket</th><th className="px-2 py-2">Days</th><th className="px-2 py-2">Avg 1D</th><th className="px-2 py-2">Avg 5D</th><th className="px-2 py-2">Avg 10D</th><th className="px-2 py-2">Avg 20D</th><th className="px-2 py-2">Success 5D</th><th className="px-2 py-2">Success 20D</th></tr></thead><tbody>{bucketRows.map((b) => (<tr key={b.bucket} className="border-b border-slate-100"><td className="px-2 py-2">{b.label}</td><td className="px-2 py-2">{b.days}</td><td className="px-2 py-2">{fmt(b.avg1d)}</td><td className="px-2 py-2">{fmt(b.avg5d)}</td><td className="px-2 py-2">{fmt(b.avg10d)}</td><td className="px-2 py-2">{fmt(b.avg20d)}</td><td className="px-2 py-2">{fmt(b.success5d)}</td><td className="px-2 py-2">{fmt(b.success20d)}</td></tr>))}</tbody></table>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Action별 Forward Return</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-2 py-2">Action</th><th className="px-2 py-2">Days</th><th className="px-2 py-2">Avg Market 5D</th><th className="px-2 py-2">Avg Market 20D</th><th className="px-2 py-2">Avg Strategy 5D</th><th className="px-2 py-2">Avg Strategy 20D</th><th className="px-2 py-2">Success 5D</th><th className="px-2 py-2">Success 20D</th></tr></thead><tbody>{actionRows.map((a) => (<tr key={a.action} className="border-b border-slate-100"><td className="px-2 py-2">{a.action}</td><td className="px-2 py-2">{a.days}</td><td className="px-2 py-2">{fmt(a.avgMarket5d)}</td><td className="px-2 py-2">{fmt(a.avgMarket20d)}</td><td className="px-2 py-2">{fmt(a.avgStrategy5d)}</td><td className="px-2 py-2">{fmt(a.avgStrategy20d)}</td><td className="px-2 py-2">{fmt(a.success5d)}</td><td className="px-2 py-2">{fmt(a.success20d)}</td></tr>))}</tbody></table>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">B. Signal Type Validation</h2>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">signal_type / severity 요약</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-2 py-2">signal_type</th><th className="px-2 py-2">severity</th><th className="px-2 py-2">occurrence</th><th className="px-2 py-2">avg 1D</th><th className="px-2 py-2">avg 5D</th><th className="px-2 py-2">avg 10D</th><th className="px-2 py-2">avg 20D</th><th className="px-2 py-2">neg rate 5D</th><th className="px-2 py-2">neg rate 20D</th></tr></thead>
                <tbody>
                  {result.signalTypeValidation.byTypeSeverity.map((r) => (
                    <tr key={`${r.signal_type}-${r.severity}`} className="border-b border-slate-100">
                      <td className="px-2 py-2">{r.signal_type}</td><td className="px-2 py-2">{r.severity}</td><td className="px-2 py-2">{r.occurrence_count}</td><td className="px-2 py-2">{fmt(r.avg_market_return_1d)}</td><td className="px-2 py-2">{fmt(r.avg_market_return_5d)}</td><td className="px-2 py-2">{fmt(r.avg_market_return_10d)}</td><td className="px-2 py-2">{fmt(r.avg_market_return_20d)}</td><td className="px-2 py-2">{fmt(r.negative_return_rate_5d)}</td><td className="px-2 py-2">{fmt(r.negative_return_rate_20d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">signal_type / severity / market_regime 요약</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-2 py-2">signal_type</th><th className="px-2 py-2">severity</th><th className="px-2 py-2">market_regime</th><th className="px-2 py-2">occurrence</th><th className="px-2 py-2">avg 5D</th><th className="px-2 py-2">avg 20D</th><th className="px-2 py-2">neg rate 5D</th><th className="px-2 py-2">neg rate 20D</th></tr></thead>
                <tbody>
                  {result.signalTypeValidation.byTypeSeverityRegime.map((r) => (
                    <tr key={`${r.signal_type}-${r.severity}-${r.market_regime}`} className="border-b border-slate-100">
                      <td className="px-2 py-2">{r.signal_type}</td><td className="px-2 py-2">{r.severity}</td><td className="px-2 py-2">{r.market_regime}</td><td className="px-2 py-2">{r.occurrence_count}</td><td className="px-2 py-2">{fmt(r.avg_market_return_5d)}</td><td className="px-2 py-2">{fmt(r.avg_market_return_20d)}</td><td className="px-2 py-2">{fmt(r.negative_return_rate_5d)}</td><td className="px-2 py-2">{fmt(r.negative_return_rate_20d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">C. Raw Backtest Rows</h2>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2">trade_date</th><th className="px-2 py-2">score</th><th className="px-2 py-2">risk_level</th><th className="px-2 py-2">market_regime</th><th className="px-2 py-2">action</th><th className="px-2 py-2">entry_price</th><th className="px-2 py-2">market_return_5d</th><th className="px-2 py-2">market_return_20d</th><th className="px-2 py-2">strategy_return_5d</th><th className="px-2 py-2">strategy_return_20d</th><th className="px-2 py-2">is_success_5d</th><th className="px-2 py-2">is_success_20d</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(-300).reverse().map((r) => (
                    <tr key={r.trade_date} className="border-b border-slate-100">
                      <td className="px-2 py-2">{r.trade_date}</td><td className="px-2 py-2">{r.score.toFixed(1)}</td><td className="px-2 py-2">{r.risk_level}</td><td className="px-2 py-2">{r.market_regime}</td><td className="px-2 py-2">{r.action}</td><td className="px-2 py-2">{r.entry_price.toFixed(2)}</td><td className="px-2 py-2">{fmt(r.market_return_5d)}</td><td className="px-2 py-2">{fmt(r.market_return_20d)}</td><td className="px-2 py-2">{fmt(r.strategy_return_5d)}</td><td className="px-2 py-2">{fmt(r.strategy_return_20d)}</td><td className="px-2 py-2">{r.is_success_5d === null ? "-" : r.is_success_5d ? "Y" : "N"}</td><td className="px-2 py-2">{r.is_success_20d === null ? "-" : r.is_success_20d ? "Y" : "N"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </AppLayout>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backtest error";
    return (
      <AppLayout title="Backtest Validation" description="Supabase 기반 백테스트 검증 모듈">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          <h2 className="text-lg font-semibold">Backtest Error</h2>
          <p className="mt-2 text-sm">{message}</p>
        </div>
      </AppLayout>
    );
  }
}


