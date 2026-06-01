import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ActionSignal = "buy" | "hold" | "watch" | "reduce" | "sell";
export type MarketRegime = "uptrend" | "neutral" | "downtrend";

type Horizon = 1 | 5 | 10 | 20;

interface RiskDailyRow {
  trade_date: string;
  total_score?: number | null;
  risk_score?: number | null;
  risk_level?: string | null;
}

interface SignalEventRow {
  trade_date: string;
  signal_type?: string | null;
  severity?: string | null;
}

interface MarketPriceRow {
  trade_date: string;
  market: string;
  close: number | null;
  ma20?: number | null;
  ma60?: number | null;
}

export interface BacktestValidationRow {
  trade_date: string;
  score: number;
  risk_level: string;
  market_regime: MarketRegime;
  action: ActionSignal;
  entry_price: number;
  exit_price_1d: number | null;
  exit_price_5d: number | null;
  exit_price_10d: number | null;
  exit_price_20d: number | null;
  market_return_1d: number | null;
  market_return_5d: number | null;
  market_return_10d: number | null;
  market_return_20d: number | null;
  strategy_return_1d: number | null;
  strategy_return_5d: number | null;
  strategy_return_10d: number | null;
  strategy_return_20d: number | null;
  is_success_1d: boolean | null;
  is_success_5d: boolean | null;
  is_success_10d: boolean | null;
  is_success_20d: boolean | null;
}

interface ActionSummaryRow {
  action: ActionSignal;
  horizon: Horizon;
  samples: number;
  successRatePct: number | null;
  avgMarketReturnPct: number | null;
  avgStrategyReturnPct: number | null;
}

export interface SignalTypeValidationSummaryRow {
  signal_type: string;
  severity: string;
  market_regime: MarketRegime | "all";
  occurrence_count: number;
  avg_market_return_1d: number | null;
  avg_market_return_5d: number | null;
  avg_market_return_10d: number | null;
  avg_market_return_20d: number | null;
  negative_return_rate_5d: number | null;
  negative_return_rate_20d: number | null;
}

interface BacktestResult {
  dataSource: "supabase";
  diagnostics: {
    riskRows: number;
    evaluatedRows: number;
    skippedRows: number;
    actionRule: string;
    signalEventRows: number;
    totalMarketDays: number;
    marketRiskDays: number;
    matchedDays: number;
    future20dCalculableDays: number;
    sellReduceDays: number;
    sellReduceRatioPct: number;
    market120dReturnPct: number | null;
    hasAbnormalDailyMove: boolean;
    warnings: string[];
    persistedRows: number;
  };
  rows: BacktestValidationRow[];
  summary: ActionSummaryRow[];
  signalTypeValidation: {
    byTypeSeverity: SignalTypeValidationSummaryRow[];
    byTypeSeverityRegime: SignalTypeValidationSummaryRow[];
  };
}

const HORIZONS: Horizon[] = [1, 5, 10, 20];
const ACTIONS: ActionSignal[] = ["buy", "hold", "watch", "reduce", "sell"];

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function scoreFromRiskRow(row: RiskDailyRow): number {
  const total = asFiniteNumber(row.total_score);
  const risk = asFiniteNumber(row.risk_score);
  return total ?? risk ?? 0;
}

function dateOnly(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (compact.length >= 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  return raw.slice(0, 10);
}

function rollingAverage(values: Array<number | null>, endIdx: number, window: number): number | null {
  if (endIdx - window + 1 < 0) return null;
  let sum = 0;
  let count = 0;
  for (let i = endIdx - window + 1; i <= endIdx; i += 1) {
    const v = values[i];
    if (v === null) return null;
    sum += v;
    count += 1;
  }
  return count === window ? sum / count : null;
}

export function deriveActionFromRisk(row: RiskDailyRow, marketRow?: MarketPriceRow): ActionSignal {
  const score = scoreFromRiskRow(row);
  const riskLevel = String(row.risk_level ?? "").toLowerCase();
  const regime = deriveMarketRegime(marketRow);
  const close = marketRow?.close ?? null;
  const ma20 = marketRow?.ma20 ?? null;
  const isBelowMa20 = close !== null && ma20 !== null ? close < ma20 : false;
  const weakDown = regime === "downtrend" || isBelowMa20;

  // 3rd tuning:
  // - Keep score-based backbone.
  // - Use risk_level + weakDown to emit practical reduce samples in danger zones.
  if (score >= 90) return weakDown ? "sell" : "reduce";
  if (score >= 85) return weakDown ? "sell" : "reduce";
  if (score >= 75) return "reduce";

  if (riskLevel.includes("danger")) {
    if (weakDown && score >= 60) return "reduce";
    if (score >= 65) return "watch";
    return "hold";
  }

  if (score >= 65) return weakDown ? "watch" : "hold";
  if (score >= 45) return "hold";
  return "buy";
}

export function deriveMarketRegime(marketRow?: MarketPriceRow): MarketRegime {
  if (!marketRow) return "neutral";
  const close = asFiniteNumber(marketRow.close);
  const ma20 = asFiniteNumber(marketRow.ma20);
  const ma60 = asFiniteNumber(marketRow.ma60);

  if (close !== null && ma20 !== null && ma60 !== null) {
    if (close > ma20 && ma20 > ma60) return "uptrend";
    if (close < ma20 && ma20 < ma60) return "downtrend";
  }

  // Fallback regime heuristic when MA data is partially missing or flat.
  if (close !== null && ma20 !== null) {
    const dev = (close - ma20) / ma20;
    if (dev >= 0.015) return "uptrend";
    if (dev <= -0.015) return "downtrend";
  }

  if (ma20 !== null && ma60 !== null) {
    const slope = (ma20 - ma60) / ma60;
    if (slope >= 0.01) return "uptrend";
    if (slope <= -0.01) return "downtrend";
  }
  return "neutral";
}

export function getForwardReturns(marketRows: MarketPriceRow[], tradeDate: string, horizons: Horizon[]): Record<Horizon, number | null> {
  const index = marketRows.findIndex((row) => row.trade_date === tradeDate);
  const out = {} as Record<Horizon, number | null>;
  if (index < 0) {
    horizons.forEach((h) => {
      out[h] = null;
    });
    return out;
  }

  for (const h of horizons) {
    const future = marketRows[index + h];
    out[h] = future ? asFiniteNumber(future.close) : null;
  }
  return out;
}

export function calculateMarketReturn(entryPrice: number, exitPrice: number): number {
  return (exitPrice - entryPrice) / entryPrice;
}

export function calculateStrategyReturn(action: ActionSignal, marketReturn: number): number | null {
  if (action === "watch") return null;
  if (action === "buy" || action === "hold") return marketReturn;
  return -marketReturn;
}

export function calculateSuccess(action: ActionSignal, marketReturn: number): boolean | null {
  if (action === "watch") return null;
  if (action === "buy" || action === "hold") return marketReturn > 0;
  return marketReturn < 0;
}

function toPct(value: number | null): number | null {
  return value === null ? null : value * 100;
}

function negativeRate(values: Array<number | null>): number | null {
  const filtered = values.filter((v): v is number => v !== null);
  if (filtered.length === 0) return null;
  return (filtered.filter((v) => v < 0).length / filtered.length) * 100;
}

async function persistBacktestResults(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  riskRows: BacktestValidationRow[],
  _signalRows: Array<{
    trade_date: string;
    signal_type: string;
    severity: string;
    market_regime: MarketRegime;
    market_return_1d: number | null;
    market_return_5d: number | null;
    market_return_10d: number | null;
    market_return_20d: number | null;
  }>
): Promise<number> {
  // Persist only compact risk-score validation rows.
  // Signal-event level rows are summarized in-memory/UI and are not persisted
  // to avoid excessive backtest_results growth.
  const toRiskPayload = riskRows.map((r) => ({
    source_type: "market_risk_daily",
    source_id: null,
    trade_date: r.trade_date,
    score: r.score,
    risk_level: r.risk_level,
    market_regime: r.market_regime,
    action: r.action,
    signal_type: null,
    severity: null,
    entry_price: r.entry_price,
    exit_price_1d: null,
    exit_price_5d: r.exit_price_5d,
    exit_price_10d: null,
    exit_price_20d: r.exit_price_20d,
    market_return_1d: null,
    market_return_5d: r.market_return_5d,
    market_return_10d: null,
    market_return_20d: r.market_return_20d,
    strategy_return_1d: null,
    strategy_return_5d: r.strategy_return_5d,
    strategy_return_10d: null,
    strategy_return_20d: r.strategy_return_20d,
    is_success_1d: null,
    is_success_5d: r.is_success_5d,
    is_success_10d: null,
    is_success_20d: r.is_success_20d
  }));
  const allPayload = [...toRiskPayload];
  if (allPayload.length === 0) return 0;

  const delExisting = await supabase.from("backtest_results").delete().in("source_type", ["market_risk_daily", "signal_event"]);
  if (delExisting.error) throw new Error(`Backtest save failed(delete existing rows): ${delExisting.error.message}`);

  const chunkSize = 1000;
  let inserted = 0;
  for (let i = 0; i < allPayload.length; i += chunkSize) {
    const chunk = allPayload.slice(i, i + chunkSize);
    const ins = await supabase.from("backtest_results").insert(chunk);
    if (ins.error) throw new Error(`Backtest save failed(insert rows): ${ins.error.message}`);
    inserted += chunk.length;
  }
  return inserted;
}

export async function runBacktestValidation(): Promise<BacktestResult> {
  const supabase = getSupabaseAdmin();

  const [riskTotalRes, indexRes, signalRes] = await Promise.all([
    supabase.from("market_risk_daily").select("trade_date,total_score,risk_level").order("trade_date", { ascending: true }),
    supabase.from("market_index_daily").select("*").eq("market", "KOSPI").order("trade_date", { ascending: true }),
    supabase.from("signal_events").select("trade_date,signal_type,severity").order("trade_date", { ascending: true })
  ]);

  let riskRowsRaw: RiskDailyRow[] | null = null;
  if (!riskTotalRes.error) {
    riskRowsRaw = (riskTotalRes.data ?? []) as RiskDailyRow[];
  } else {
    const riskFallbackRes = await supabase
      .from("market_risk_daily")
      .select("trade_date,risk_score,risk_level")
      .order("trade_date", { ascending: true });
    if (riskFallbackRes.error) {
      throw new Error(`Backtest load failed: market_risk_daily query error - ${riskFallbackRes.error.message}`);
    }
    riskRowsRaw = (riskFallbackRes.data ?? []) as RiskDailyRow[];
  }

  if (indexRes.error) throw new Error(`Backtest load failed: market_index_daily query error - ${indexRes.error.message}`);
  if (signalRes.error) throw new Error(`Backtest load failed: signal_events query error - ${signalRes.error.message}`);

  const riskRows = riskRowsRaw ?? [];
  const signalRows = (signalRes.data ?? []) as SignalEventRow[];

  const marketRowsBase = ((indexRes.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      trade_date: dateOnly(row.trade_date),
      market: String(row.market ?? "KOSPI"),
      close: asFiniteNumber(row.close),
      ma20: asFiniteNumber(row.ma20),
      ma60: asFiniteNumber(row.ma60)
    }))
    .filter((row) => row.trade_date && row.close !== null) as MarketPriceRow[];

  const closes = marketRowsBase.map((r) => asFiniteNumber(r.close));
  const marketRows = marketRowsBase.map((row, idx) => {
    const ma20Computed = rollingAverage(closes, idx, 20);
    const ma60Computed = rollingAverage(closes, idx, 60);
    return {
      ...row,
      ma20: row.ma20 ?? ma20Computed,
      ma60: row.ma60 ?? ma60Computed
    };
  });

  if (marketRows.length === 0) {
    throw new Error("Backtest load failed: market_index_daily has no valid KOSPI close rows.");
  }

  const marketByDate = new Map(marketRows.map((row) => [dateOnly(row.trade_date), row]));
  const rows: BacktestValidationRow[] = [];
  let skippedRows = 0;

  for (const risk of riskRows) {
    const riskDate = dateOnly(risk.trade_date);
    const marketRow = marketByDate.get(riskDate);
    if (!marketRow || marketRow.close === null) {
      skippedRows += 1;
      continue;
    }

    const entryPrice = marketRow.close;
    const exits = getForwardReturns(marketRows, riskDate, HORIZONS);

    const calcOne = (h: Horizon) => {
      const exit = exits[h];
      if (exit === null) {
        return { marketReturn: null, strategyReturn: null, success: null };
      }
      const marketReturn = calculateMarketReturn(entryPrice, exit);
      const action = deriveActionFromRisk(risk, marketRow);
      return {
        marketReturn,
        strategyReturn: calculateStrategyReturn(action, marketReturn),
        success: calculateSuccess(action, marketReturn)
      };
    };

    const r1 = calcOne(1);
    const r5 = calcOne(5);
    const r10 = calcOne(10);
    const r20 = calcOne(20);

    const action = deriveActionFromRisk(risk, marketRow);

    rows.push({
      trade_date: riskDate,
      score: scoreFromRiskRow(risk),
      risk_level: String(risk.risk_level ?? "unknown"),
      market_regime: deriveMarketRegime(marketRow),
      action,
      entry_price: entryPrice,
      exit_price_1d: exits[1],
      exit_price_5d: exits[5],
      exit_price_10d: exits[10],
      exit_price_20d: exits[20],
      market_return_1d: toPct(r1.marketReturn),
      market_return_5d: toPct(r5.marketReturn),
      market_return_10d: toPct(r10.marketReturn),
      market_return_20d: toPct(r20.marketReturn),
      strategy_return_1d: toPct(r1.strategyReturn),
      strategy_return_5d: toPct(r5.strategyReturn),
      strategy_return_10d: toPct(r10.strategyReturn),
      strategy_return_20d: toPct(r20.strategyReturn),
      is_success_1d: r1.success,
      is_success_5d: r5.success,
      is_success_10d: r10.success,
      is_success_20d: r20.success
    });
  }

  const summary: ActionSummaryRow[] = [];
  for (const action of ACTIONS) {
    for (const horizon of HORIZONS) {
      const marketKey = `market_return_${horizon}d` as const;
      const strategyKey = `strategy_return_${horizon}d` as const;
      const successKey = `is_success_${horizon}d` as const;

      const group = rows.filter((row) => row.action === action);
      const marketVals = group.map((r) => r[marketKey]).filter((v): v is number => v !== null);
      const strategyVals = group.map((r) => r[strategyKey]).filter((v): v is number => v !== null);
      const successVals = group.map((r) => r[successKey]).filter((v): v is boolean => v !== null);

      summary.push({
        action,
        horizon,
        samples: group.length,
        successRatePct: successVals.length ? (successVals.filter(Boolean).length / successVals.length) * 100 : null,
        avgMarketReturnPct: avg(marketVals),
        avgStrategyReturnPct: avg(strategyVals)
      });
    }
  }

  const signalRowsWithForward = signalRows
    .map((s) => {
      const sDate = dateOnly(s.trade_date);
      const m = marketByDate.get(sDate);
      if (!m || m.close === null) return null;
      const exits = getForwardReturns(marketRows, sDate, HORIZONS);

      const m1 = exits[1] === null ? null : toPct(calculateMarketReturn(m.close, exits[1]));
      const m5 = exits[5] === null ? null : toPct(calculateMarketReturn(m.close, exits[5]));
      const m10 = exits[10] === null ? null : toPct(calculateMarketReturn(m.close, exits[10]));
      const m20 = exits[20] === null ? null : toPct(calculateMarketReturn(m.close, exits[20]));

      return {
        trade_date: sDate,
        signal_type: String(s.signal_type ?? "unknown"),
        severity: String(s.severity ?? "unknown"),
        market_regime: deriveMarketRegime(m),
        market_return_1d: m1,
        market_return_5d: m5,
        market_return_10d: m10,
        market_return_20d: m20
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const groupedByTypeSeverity = new Map<string, typeof signalRowsWithForward>();
  const groupedByTypeSeverityRegime = new Map<string, typeof signalRowsWithForward>();

  for (const row of signalRowsWithForward) {
    const k1 = `${row.signal_type}__${row.severity}`;
    const k2 = `${row.signal_type}__${row.severity}__${row.market_regime}`;
    groupedByTypeSeverity.set(k1, [...(groupedByTypeSeverity.get(k1) ?? []), row]);
    groupedByTypeSeverityRegime.set(k2, [...(groupedByTypeSeverityRegime.get(k2) ?? []), row]);
  }

  const buildSignalSummary = (items: typeof signalRowsWithForward, signal_type: string, severity: string, market_regime: MarketRegime | "all"): SignalTypeValidationSummaryRow => ({
    signal_type,
    severity,
    market_regime,
    occurrence_count: items.length,
    avg_market_return_1d: avg(items.map((r) => r.market_return_1d).filter((v): v is number => v !== null)),
    avg_market_return_5d: avg(items.map((r) => r.market_return_5d).filter((v): v is number => v !== null)),
    avg_market_return_10d: avg(items.map((r) => r.market_return_10d).filter((v): v is number => v !== null)),
    avg_market_return_20d: avg(items.map((r) => r.market_return_20d).filter((v): v is number => v !== null)),
    negative_return_rate_5d: negativeRate(items.map((r) => r.market_return_5d)),
    negative_return_rate_20d: negativeRate(items.map((r) => r.market_return_20d))
  });

  const byTypeSeverity: SignalTypeValidationSummaryRow[] = Array.from(groupedByTypeSeverity.entries()).map(([key, items]) => {
    const [signal_type, severity] = key.split("__");
    return buildSignalSummary(items, signal_type, severity, "all");
  });

  const byTypeSeverityRegime: SignalTypeValidationSummaryRow[] = Array.from(groupedByTypeSeverityRegime.entries()).map(([key, items]) => {
    const [signal_type, severity, market_regime] = key.split("__");
    return buildSignalSummary(items, signal_type, severity, market_regime as MarketRegime);
  });

  const totalMarketDays = marketRows.length;
  const marketRiskDays = riskRows.length;
  const matchedDays = rows.length;
  const future20dCalculableDays = rows.filter((r) => r.exit_price_20d !== null).length;
  const sellReduceDays = rows.filter((r) => r.action === "sell" || r.action === "reduce").length;
  const sellReduceRatioPct = matchedDays > 0 ? (sellReduceDays / matchedDays) * 100 : 0;

  const market120dReturnPct =
    marketRows.length >= 120
      ? toPct(calculateMarketReturn(marketRows[0].close as number, marketRows[119].close as number))
      : null;

  let hasAbnormalDailyMove = false;
  for (let i = 1; i < marketRows.length; i += 1) {
    const prev = marketRows[i - 1].close as number;
    const curr = marketRows[i].close as number;
    const daily = calculateMarketReturn(prev, curr);
    if (Math.abs(daily) >= 0.1) {
      hasAbnormalDailyMove = true;
      break;
    }
  }

  const warnings: string[] = [];
  if (sellReduceRatioPct >= 80) {
    warnings.push("Sell/Reduce action이 전체 테스트 일수의 80% 이상에서 발생했습니다. danger 기준이 너무 낮거나 score → action 변환 로직이 과민할 수 있습니다.");
  }
  if (market120dReturnPct !== null && market120dReturnPct >= 50) {
    warnings.push("테스트 구간은 고변동/강한 추세 구간입니다. 120거래일 수익률이 매우 높아 신호 성과 해석 시 변동성 영향을 함께 고려하세요.");
  }
  if (hasAbnormalDailyMove) {
    warnings.push("일간 변동률이 큰 구간이 관측되었습니다. 신호 성과 해석 시 단기 변동성 영향을 함께 고려하세요.");
  }

  let persistedRows = 0;
  try {
    persistedRows = await persistBacktestResults(supabase, rows, signalRowsWithForward);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backtest save failed.";
    warnings.push(message);
  }

  return {
    dataSource: "supabase",
    diagnostics: {
      riskRows: riskRows.length,
      evaluatedRows: rows.length,
      skippedRows,
      actionRule: "score>=90 sell/reduce, >=85 sell/reduce, >=75 reduce, danger+weakDown(>=60) reduce, >=65 watch/hold, >=45 hold, <45 buy",
      signalEventRows: signalRowsWithForward.length,
      totalMarketDays,
      marketRiskDays,
      matchedDays,
      future20dCalculableDays,
      sellReduceDays,
      sellReduceRatioPct,
      market120dReturnPct,
      hasAbnormalDailyMove,
      warnings,
      persistedRows
    },
    rows,
    summary,
    signalTypeValidation: {
      byTypeSeverity,
      byTypeSeverityRegime
    }
  };
}
