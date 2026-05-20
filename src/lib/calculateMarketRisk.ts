import type {
  InvestorFlowDaily,
  MarketCmaDaily,
  MarketCreditBalanceDaily,
  MarketIndexDaily,
  MarketLiquidityDaily,
  MarketRiskScore,
  SignalEvent
} from "@/types/market";
import { getKospiMovingAverages } from "@/lib/calculateMovingAverages";
import { avg, clamp, getRiskLevel, sortByDateAsc, uniqSortedDates } from "@/lib/riskUtils";
import type { MarketRiskResult } from "@/types/risk";
import type {
  CmaDaily as RiskCmaDaily,
  CreditBalanceDaily as RiskCreditBalanceDaily,
  InvestorFlowDaily as RiskInvestorFlowDaily,
  MarketCapDaily as RiskMarketCapDaily,
  MarketIndexDaily as RiskMarketIndexDaily,
  MarketLiquidityDaily as RiskMarketLiquidityDaily,
  MarketRiskCalculationResult,
  SignalEventInput
} from "@/types/risk";

interface RiskDataset {
  liquidityRows: MarketLiquidityDaily[];
  creditRows: MarketCreditBalanceDaily[];
  cmaRows: MarketCmaDaily[];
  indexRows: MarketIndexDaily[];
  flowRows: InvestorFlowDaily[];
}

interface ConditionScores {
  liquidityScore: number;
  leverageScore: number;
  flowScore: number;
  technicalScore: number;
  marketBreadthScore: number;
  macroScore: number;
}

function baseScores(): ConditionScores {
  return {
    liquidityScore: 0,
    leverageScore: 0,
    flowScore: 0,
    technicalScore: 0,
    marketBreadthScore: 0,
    macroScore: 0
  };
}

function inRange<T extends { tradeDate: string }>(rows: T[], tradeDate: string): T[] {
  return rows.filter((row) => row.tradeDate <= tradeDate);
}

function latestDate(rows: Array<{ tradeDate: string }>): string | null {
  return rows.length ? sortByDateAsc(rows).at(-1)!.tradeDate : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function movingAverageAt(values: Array<number | null | undefined>, window: number, index: number): number | null {
  if (index < window - 1) return null;
  const nums = values.slice(index - window + 1, index + 1);
  if (nums.some((value) => !isFiniteNumber(value))) return null;
  return avg(nums as number[]);
}

function hasVolumeSurge(volume: number | null | undefined, recentVolumes: Array<number | null | undefined>, multiplier = 1.5): boolean {
  if (!isFiniteNumber(volume)) return false;
  if (recentVolumes.length < 20) return false;
  if (recentVolumes.some((value) => !isFiniteNumber(value))) return false;
  const volumeMa20 = avg(recentVolumes as number[]);
  return volumeMa20 > 0 && volume > volumeMa20 * multiplier;
}

function isGenuineKospiMa60Break(indexRows: MarketIndexDaily[], tradeDate: string): boolean {
  const kospiRows = sortByDateAsc(indexRows).filter((row) => row.market === "KOSPI" && row.tradeDate <= tradeDate);
  const closes = kospiRows.map((row) => row.close);
  const latestIndex = kospiRows.length - 1;
  const current = kospiRows.at(-1)?.close ?? null;
  const ma60 = movingAverageAt(closes, 60, latestIndex);

  if (!isFiniteNumber(current) || ma60 === null || current >= ma60) return false;

  const recentThreeConfirm =
    latestIndex >= 2 &&
    [latestIndex - 2, latestIndex - 1, latestIndex].every((index) => {
      const close = kospiRows[index]?.close;
      const rowMa60 = movingAverageAt(closes, 60, index);
      return isFiniteNumber(close) && rowMa60 !== null && close < rowMa60;
    });

  const recentVolumes = kospiRows.slice(Math.max(0, kospiRows.length - 20)).map((row) => row.volume);
  const volumeSurge = hasVolumeSurge(kospiRows.at(-1)?.volume, recentVolumes);

  return recentThreeConfirm || volumeSurge;
}

function evaluateLiquidity(tradeDate: string, liquidityRows: MarketLiquidityDaily[], createdAt: string): { score: number; signals: SignalEvent[] } {
  const window = inRange(liquidityRows, tradeDate)
    .filter((row) => typeof row.investorDepositMillionKrw === "number")
    .slice(-60);
  if (window.length === 0) return { score: 0, signals: [] };

  const latest = window.at(-1)!.investorDepositMillionKrw as number;
  const peak = Math.max(...window.map((row) => row.investorDepositMillionKrw as number));
  if (peak <= 0) return { score: 0, signals: [] };

  const drawdown = (peak - latest) / peak;
  let score = 0;
  const signals: SignalEvent[] = [];

  if (drawdown >= 0.1) {
    score += 18;
    signals.push({
      tradeDate,
      ticker: "MARKET",
      signalType: "reduce",
      triggerScore: 18,
      triggerReason: `예탁금 고점 대비 ${(drawdown * 100).toFixed(1)}% 감소`,
      createdAt
    });
  }
  if (drawdown >= 0.15) score += 4;
  if (drawdown >= 0.2) score += 3;

  return { score: clamp(score, 0, 25), signals };
}

function evaluateCredit(tradeDate: string, creditRows: MarketCreditBalanceDaily[], createdAt: string): { score: number; signals: SignalEvent[] } {
  const window = inRange(creditRows, tradeDate)
    .filter((row) => typeof row.creditLoanMillionKrw === "number")
    .slice(-10);
  if (window.length < 10) return { score: 0, signals: [] };

  const lastRow = window.at(-1)!;
  if (lastRow.tradeDate !== tradeDate) return { score: 0, signals: [] };

  const first = window[0].creditLoanMillionKrw as number;
  const last = lastRow.creditLoanMillionKrw as number;
  if (first <= 0) return { score: 0, signals: [] };

  const changeRate = (last - first) / first;
  let score = 0;
  const signals: SignalEvent[] = [];

  if (changeRate <= -0.05) {
    score += 14;
    if (changeRate <= -0.08) score += 4;
    if (changeRate <= -0.1) score += 2;
    signals.push({
      tradeDate,
      ticker: "MARKET",
      signalType: "reduce",
      triggerScore: clamp(score, 0, 20),
      triggerReason: `신용융자 10일 변화율 ${(changeRate * 100).toFixed(1)}%`,
      createdAt
    });
  }

  return { score: clamp(score, 0, 20), signals };
}

function evaluateCma(tradeDate: string, cmaRows: MarketCmaDaily[], createdAt: string): { score: number; signals: SignalEvent[] } {
  const window = inRange(cmaRows, tradeDate)
    .filter((row) => typeof row.totalMillionKrw === "number")
    .slice(-20)
    .map((row) => row.totalMillionKrw as number);

  if (window.length < 20) return { score: 0, signals: [] };
  const latest = window.at(-1)!;
  const ma20 = avg(window);

  if (latest < ma20) {
    return {
      score: 6,
      signals: [
        {
          tradeDate,
          ticker: "MARKET",
          signalType: "hold",
          triggerScore: 6,
          triggerReason: "CMA 20일 평균 하회",
          createdAt
        }
      ]
    };
  }

  return { score: 0, signals: [] };
}

function evaluateFlow(tradeDate: string, flowRows: InvestorFlowDaily[], createdAt: string): { score: number; signals: SignalEvent[] } {
  const kospiFlowByDate = new Map<string, { foreign: number; institution: number }>();
  for (const row of sortByDateAsc(inRange(flowRows, tradeDate))) {
    if (row.market !== "KOSPI") continue;
    const prev = kospiFlowByDate.get(row.tradeDate) ?? { foreign: 0, institution: 0 };
    kospiFlowByDate.set(row.tradeDate, {
      foreign: prev.foreign + (row.foreignNetBuy ?? 0),
      institution: prev.institution + (row.institutionNetBuy ?? 0)
    });
  }

  const last5 = Array.from(kospiFlowByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-5);

  let score = 0;
  const signals: SignalEvent[] = [];

  if (last5.length >= 5) {
    const foreignSell5 = last5.every(([, v]) => v.foreign < 0);
    if (foreignSell5) {
      score += 14;
      const totalNet = last5.reduce((acc, [, v]) => acc + v.foreign, 0);
      if (totalNet < -500000) score += 4;
      if (totalNet < -1000000) score += 2;
      signals.push({
        tradeDate,
        ticker: "KOSPI",
        signalType: "reduce",
        triggerScore: clamp(score, 0, 20),
        triggerReason: "외국인 5거래일 연속 순매도",
        createdAt
      });
    }

    const sameDayDualSell = last5.some(([, v]) => v.foreign < 0 && v.institution < 0);
    if (sameDayDualSell) {
      score += 4;
      signals.push({
        tradeDate,
        ticker: "KOSPI",
        signalType: "hold",
        triggerScore: 4,
        triggerReason: "외국인/기관 동시 순매도 발생",
        createdAt
      });
    }
  }

  return { score: clamp(score, 0, 20), signals };
}

function evaluateTechnical(tradeDate: string, indexRows: MarketIndexDaily[], createdAt: string): { score: number; signals: SignalEvent[] } {
  const { current, ma20, ma60 } = getKospiMovingAverages(indexRows, tradeDate);
  if (current === null) return { score: 0, signals: [] };

  let score = 0;
  const signals: SignalEvent[] = [];

  if (ma20 !== null && current < ma20) {
    score += 6;
    signals.push({
      tradeDate,
      ticker: "KOSPI",
      signalType: "hold",
      triggerScore: 6,
      triggerReason: "코스피 20일선 이탈",
      createdAt
    });
  }

  if (ma60 !== null && current < ma60 && isGenuineKospiMa60Break(indexRows, tradeDate)) {
    score += 9;
    signals.push({
      tradeDate,
      ticker: "KOSPI",
      signalType: "sell",
      triggerScore: 9,
      triggerReason: "코스피 60일선 이탈",
      createdAt
    });
  }

  return { score: clamp(score, 0, 20), signals };
}

export function calculateMarketRiskForDate(dataset: RiskDataset, tradeDate: string, createdAt = new Date().toISOString()): MarketRiskResult {
  const scores = baseScores();
  const signals: SignalEvent[] = [];

  const liq = evaluateLiquidity(tradeDate, dataset.liquidityRows, createdAt);
  scores.liquidityScore = liq.score;
  signals.push(...liq.signals);

  const credit = evaluateCredit(tradeDate, dataset.creditRows, createdAt);
  scores.leverageScore = credit.score;
  signals.push(...credit.signals);

  const flow = evaluateFlow(tradeDate, dataset.flowRows, createdAt);
  scores.flowScore = flow.score;
  signals.push(...flow.signals);

  const cma = evaluateCma(tradeDate, dataset.cmaRows, createdAt);
  scores.flowScore = clamp(scores.flowScore + cma.score, 0, 20);
  signals.push(...cma.signals);

  const tech = evaluateTechnical(tradeDate, dataset.indexRows, createdAt);
  scores.technicalScore = tech.score;
  signals.push(...tech.signals);

  const totalScore = clamp(
    scores.liquidityScore + scores.leverageScore + scores.flowScore + scores.technicalScore + scores.marketBreadthScore + scores.macroScore,
    0,
    100
  );

  return {
    tradeDate,
    ...scores,
    totalScore,
    riskLevel: getRiskLevel(totalScore),
    signals,
    createdAt
  };
}

export function buildMarketRiskSeries(dataset: RiskDataset): MarketRiskResult[] {
  const dates = uniqSortedDates([
    ...dataset.liquidityRows.map((row) => row.tradeDate),
    ...dataset.creditRows.map((row) => row.tradeDate),
    ...dataset.cmaRows.map((row) => row.tradeDate),
    ...dataset.indexRows.filter((row) => row.market === "KOSPI").map((row) => row.tradeDate),
    ...dataset.flowRows.map((row) => row.tradeDate)
  ]);

  const createdAt = new Date().toISOString();
  return dates.map((tradeDate) => calculateMarketRiskForDate(dataset, tradeDate, createdAt));
}

export function calculateMarketRisk(
  liquidityRows: MarketLiquidityDaily[],
  indexRows: MarketIndexDaily[],
  flowRows: InvestorFlowDaily[],
  creditBalanceRows: MarketCreditBalanceDaily[],
  cmaRows: MarketCmaDaily[] = [],
  options: { createdAt?: string } = {}
): MarketRiskScore {
  const createdAt = options.createdAt ?? new Date().toISOString();

  const lastTradeDate =
    latestDate(indexRows.filter((row) => row.market === "KOSPI")) ??
    latestDate(liquidityRows) ??
    latestDate(creditBalanceRows) ??
    latestDate(cmaRows) ??
    latestDate(flowRows) ??
    createdAt.slice(0, 10);

  return calculateMarketRiskForDate(
    {
      liquidityRows: sortByDateAsc(liquidityRows),
      creditRows: sortByDateAsc(creditBalanceRows),
      cmaRows: sortByDateAsc(cmaRows),
      indexRows: sortByDateAsc(indexRows),
      flowRows: sortByDateAsc(flowRows)
    },
    lastTradeDate,
    createdAt
  );
}

type CalculateMarketRiskParams = {
  liquidityRows: RiskMarketLiquidityDaily[];
  creditRows: RiskCreditBalanceDaily[];
  cmaRows: RiskCmaDaily[];
  indexRows: RiskMarketIndexDaily[];
  flowRows: RiskInvestorFlowDaily[];
  marketCapRows?: RiskMarketCapDaily[];
  debug?: boolean;
};

function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function isConfirmedKospiMa60Break(
  sortedKospi: RiskMarketIndexDaily[],
  maMap: Map<string, { ma20: number | null; ma60: number | null }>,
  index: number
): boolean {
  const kospi = sortedKospi[index];
  const ma60 = maMap.get(kospi.trade_date)?.ma60 ?? null;
  if (!isFiniteNumber(kospi.close) || ma60 === null || kospi.close >= ma60) return false;

  const threeDayConfirm =
    index >= 2 &&
    [index - 2, index - 1, index].every((rowIndex) => {
      const row = sortedKospi[rowIndex];
      const rowMa60 = maMap.get(row.trade_date)?.ma60 ?? null;
      return isFiniteNumber(row.close) && rowMa60 !== null && row.close < rowMa60;
    });

  const recentVolumes = sortedKospi.slice(Math.max(0, index - 19), index + 1).map((row) => row.volume);
  const volumeSurge = hasVolumeSurge(kospi.volume, recentVolumes);

  return threeDayConfirm || volumeSurge;
}

export function calculateMarketRiskEngine({
  liquidityRows,
  creditRows,
  cmaRows,
  indexRows,
  flowRows,
  marketCapRows = [],
  debug = false
}: CalculateMarketRiskParams): MarketRiskCalculationResult {
  const sortedKospi = [...indexRows]
    .filter((r) => String(r.market).replace(/\s/g, "").toUpperCase() === "KOSPI")
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  const maMap = new Map<string, { ma20: number | null; ma60: number | null }>();
  for (let i = 0; i < sortedKospi.length; i += 1) {
    const c20 = sortedKospi.slice(Math.max(0, i - 19), i + 1).map((r) => r.close).filter((v): v is number => typeof v === "number");
    const c60 = sortedKospi.slice(Math.max(0, i - 59), i + 1).map((r) => r.close).filter((v): v is number => typeof v === "number");
    maMap.set(sortedKospi[i].trade_date, {
      ma20: c20.length === 20 ? avg(c20) : null,
      ma60: c60.length === 60 ? avg(c60) : null
    });
  }

  const liquidityByDate = new Map(liquidityRows.map((r) => [r.trade_date, r]));
  const creditByDate = new Map(creditRows.map((r) => [r.trade_date, r]));
  const cmaByDate = new Map(cmaRows.map((r) => [r.trade_date, r]));
  const marketCapByDate = new Map<string, number>();
  for (const row of marketCapRows) {
    const market = String(row.market).replace(/\s/g, "").toUpperCase();
    if (market !== "KOSPI" && market !== "KOSDAQ") continue;
    if (typeof row.market_cap_million_krw !== "number" || row.market_cap_million_krw <= 0) continue;
    marketCapByDate.set(row.trade_date, (marketCapByDate.get(row.trade_date) ?? 0) + row.market_cap_million_krw);
  }

  const creditToMarketCapRatioByDate = new Map<string, number>();
  for (const [date, credit] of creditByDate) {
    const creditLoan = credit.credit_loan_million_krw;
    const totalMarketCap = marketCapByDate.get(date) ?? null;
    if (typeof creditLoan === "number" && typeof totalMarketCap === "number" && totalMarketCap > 0) {
      creditToMarketCapRatioByDate.set(date, (creditLoan / totalMarketCap) * 100);
    }
  }

  const flowByDate = new Map<string, { foreign: number; institution: number }>();
  for (const row of flowRows) {
    if (String(row.market).replace(/\s/g, "").toUpperCase() !== "KOSPI") continue;
    const prev = flowByDate.get(row.trade_date) ?? { foreign: 0, institution: 0 };
    flowByDate.set(row.trade_date, {
      foreign: prev.foreign + (row.foreign_net_buy ?? 0),
      institution: prev.institution + (row.institution_net_buy ?? 0)
    });
  }

  const risks: MarketRiskCalculationResult["risks"] = [];
  const signals: SignalEventInput[] = [];

  const riskLevelKo: Record<string, string> = {
    stable: "안정",
    caution: "주의",
    warning: "경고",
    danger: "위험",
    crisis: "위기"
  };
  function getRiskLevelLabel(riskLevel: string): string {
    return riskLevelKo[riskLevel] ?? riskLevel;
  }

  function getActionMessage(totalScore: number): string {
    if (totalScore >= 85) return "위기 국면으로, 현금 중심 대응을 우선 검토해야 합니다.";
    if (totalScore >= 60) return "위험 단계로, 적극적인 리스크 관리가 필요합니다.";
    if (totalScore >= 40) return "경고 단계로, 일부 비중 축소와 현금 확보를 검토할 필요가 있습니다.";
    if (totalScore >= 20) return "주의가 필요하며, 급등주와 신용 사용 종목은 점검이 필요합니다.";
    return "현재 주요 매도 위험 신호는 제한적입니다.";
  }

  function buildSummary(params: {
    totalScore: number;
    riskLevel: string;
    liquidityScore: number;
    leverageScore: number;
    cmaScore: number;
    flowScore: number;
    technicalScore: number;
  }): string {
    const { totalScore, riskLevel, liquidityScore, leverageScore, cmaScore, flowScore, technicalScore } = params;
    const parts: string[] = [];

    parts.push(`위험 점수 ${totalScore}점, ${getRiskLevelLabel(riskLevel)} 단계입니다.`);
    parts.push(getActionMessage(totalScore));

    const detailMessages: string[] = [];
    if (leverageScore > 0) detailMessages.push("레버리지 과열 또는 신용 위험 신호가 감지됩니다");
    if (liquidityScore > 0) detailMessages.push("대기자금 이탈 또는 유동성 약화 신호가 감지됩니다");
    if (flowScore > 0) detailMessages.push("외국인·기관 수급 악화 신호가 감지됩니다");
    if (technicalScore > 0) detailMessages.push("KOSPI 이동평균선 이탈로 기술적 추세 훼손 신호가 있습니다");
    if (cmaScore > 0) detailMessages.push("CMA 잔고 약화 신호가 감지됩니다");
    if (detailMessages.length > 0) parts.push(`${detailMessages.join(", ")}.`);

    if (technicalScore === 0) parts.push("지수 추세 훼손은 아직 제한적입니다.");
    if (liquidityScore === 0) parts.push("대기자금 이탈 신호는 아직 제한적입니다.");

    return parts.slice(0, 5).join(" ");
  }


  for (let i = 0; i < sortedKospi.length; i += 1) {
    const kospi = sortedKospi[i];
    const date = kospi.trade_date;
    const liq = liquidityByDate.get(date);
    const credit = creditByDate.get(date);
    if (!liq || !credit || typeof kospi.close !== "number") continue;

    let liquidityScore = 0;
    let leverageScore = 0;
    let cmaScore = 0;
    let flowScore = 0;
    let technicalScore = 0;
    const daySignals: SignalEventInput[] = [];

    const last60Dates = sortedKospi.slice(Math.max(0, i - 59), i + 1).map((r) => r.trade_date);
    const last60Deposits = last60Dates.map((d) => liquidityByDate.get(d)?.investor_deposit_million_krw ?? null);
    const high60 = last60Deposits.filter((v): v is number => typeof v === "number").reduce((m, v) => Math.max(m, v), Number.NEGATIVE_INFINITY);
    if (Number.isFinite(high60) && liq.investor_deposit_million_krw !== null) {
      const drawdownPct = ((high60 - liq.investor_deposit_million_krw) / high60) * 100;
      if (drawdownPct >= 10) {
        liquidityScore += 15;
        daySignals.push({
          trade_date: date,
          signal_type: "deposit_drawdown_60d",
          severity: "warning",
          score_delta: 15,
          title: "투자자예탁금 60일 고점 대비 10% 이상 감소",
          description: `투자자예탁금이 최근 60거래일 고점 대비 ${drawdownPct.toFixed(1)}% 감소했습니다.`
        });
      }
    }
    liquidityScore = Math.min(25, liquidityScore);

    // Leverage risk: sharp drop + overheating conditions
    const creditLoan = credit.credit_loan_million_krw;
    const totalCredit = credit.total_credit_million_krw ?? null;

    const prev10Date = i >= 10 ? sortedKospi[i - 10].trade_date : null;
    const prev10Credit = prev10Date ? creditByDate.get(prev10Date)?.credit_loan_million_krw ?? null : null;
    const prev20Date = i >= 20 ? sortedKospi[i - 20].trade_date : null;
    const prev20Credit = prev20Date ? creditByDate.get(prev20Date)?.credit_loan_million_krw ?? null : null;
    const prevDate = i > 0 ? sortedKospi[i - 1].trade_date : null;
    const prevCredit = prevDate ? creditByDate.get(prevDate)?.credit_loan_million_krw ?? null : null;
    const prevKospiClose = i > 0 ? sortedKospi[i - 1].close : null;
    const kospiDown = typeof prevKospiClose === "number" ? kospi.close < prevKospiClose : false;

    const recent60Dates = sortedKospi.slice(Math.max(0, i - 59), i + 1).map((r) => r.trade_date);
    const recent60CreditLoan = recent60Dates
      .map((d) => creditByDate.get(d)?.credit_loan_million_krw ?? null)
      .filter((v): v is number => typeof v === "number");
    const recent60TotalCredit = recent60Dates
      .map((d) => creditByDate.get(d)?.total_credit_million_krw ?? null)
      .filter((v): v is number => typeof v === "number");

    const creditLoanHigh60 = recent60CreditLoan.length > 0 ? Math.max(...recent60CreditLoan) : null;
    const totalCreditHigh60 = recent60TotalCredit.length > 0 ? Math.max(...recent60TotalCredit) : null;
    const creditLoanToHighRatio =
      creditLoan !== null && creditLoanHigh60 !== null && creditLoanHigh60 > 0 ? (creditLoan / creditLoanHigh60) * 100 : null;
    const creditLoan20dChange =
      creditLoan !== null && prev20Credit !== null && prev20Credit !== 0 ? ((creditLoan - prev20Credit) / prev20Credit) * 100 : null;
    const creditToDepositRatio =
      creditLoan !== null && liq.investor_deposit_million_krw !== null && liq.investor_deposit_million_krw > 0
        ? (creditLoan / liq.investor_deposit_million_krw) * 100
        : null;

    // 1) Existing sharp decline condition
    const creditLoan10dChange =
      creditLoan !== null && prev10Credit !== null && prev10Credit !== 0 ? ((creditLoan - prev10Credit) / prev10Credit) * 100 : null;
    if (creditLoan10dChange !== null && creditLoan10dChange <= -5) {
      leverageScore += 10;
      daySignals.push({
        trade_date: date,
        signal_type: "credit_loan_10d_drop",
        severity: "warning",
        score_delta: 10,
        title: "신용융자 10거래일 내 5% 이상 감소",
        description: `신용거래융자가 최근 10거래일 동안 ${creditLoan10dChange.toFixed(1)}% 감소했습니다.`
      });
    }

    const creditDailyChange =
      creditLoan !== null && prevCredit !== null && prevCredit !== 0 ? ((creditLoan - prevCredit) / prevCredit) * 100 : null;
    if (creditDailyChange !== null && kospiDown) {
      let scoreDelta = 0;
      let severity: "warning" | "danger" | null = null;

      if (creditDailyChange <= -1.0) {
        scoreDelta = 12;
        severity = "danger";
      } else if (creditDailyChange <= -0.5) {
        scoreDelta = 10;
        severity = "danger";
      } else if (creditDailyChange <= -0.3) {
        scoreDelta = 5;
        severity = "warning";
      }

      if (severity !== null && scoreDelta > 0) {
        leverageScore += scoreDelta;
        daySignals.push({
          trade_date: date,
          signal_type: "credit_down_kospi_down",
          severity,
          score_delta: scoreDelta,
          title: "신용융자 감소 + KOSPI 하락",
          description: `신용융자가 전일 대비 ${creditDailyChange.toFixed(2)}% 감소했고 KOSPI도 하락했습니다.`
        });
      }
    }

    // 2) Overheating conditions
    if (creditLoanToHighRatio !== null && creditLoanToHighRatio >= 95) {
      leverageScore += 5;
      daySignals.push({
        trade_date: date,
        signal_type: "credit_loan_near_60d_high",
        severity: "caution",
        score_delta: 5,
        title: "신용융자 60일 고점권 유지",
        description: `신용융자가 60일 고점 대비 ${creditLoanToHighRatio.toFixed(1)}% 수준입니다.`
      });
    }

    if (creditLoan20dChange !== null && creditLoan20dChange >= 3) {
      leverageScore += 5;
      daySignals.push({
        trade_date: date,
        signal_type: "credit_loan_20d_rise",
        severity: "caution",
        score_delta: 5,
        title: "신용융자 20거래일 상승",
        description: `신용융자가 20거래일 전 대비 ${creditLoan20dChange.toFixed(1)}% 증가했습니다.`
      });
    }

    if (totalCredit !== null && totalCreditHigh60 !== null && totalCreditHigh60 > 0 && totalCredit / totalCreditHigh60 >= 0.95) {
      leverageScore += 5;
      daySignals.push({
        trade_date: date,
        signal_type: "total_credit_near_60d_high",
        severity: "caution",
        score_delta: 5,
        title: "총신용 60일 고점권 유지",
        description: `총신용이 60일 고점 대비 ${((totalCredit / totalCreditHigh60) * 100).toFixed(1)}% 수준입니다.`
      });
    }

    // 3) Credit/Deposit ratio (apply only higher tier once)
    if (creditToDepositRatio !== null) {
      let ratioScore = 0;
      if (creditToDepositRatio >= 30) ratioScore = 8;
      else if (creditToDepositRatio >= 25) ratioScore = 5;
      if (ratioScore > 0) {
        leverageScore += ratioScore;
        daySignals.push({
          trade_date: date,
          signal_type: "credit_to_deposit_ratio_high",
          severity: ratioScore >= 8 ? "warning" : "caution",
          score_delta: ratioScore,
          title: "신용/예탁금 비율 과열",
          description: `신용융자/예탁금 비율이 ${creditToDepositRatio.toFixed(1)}%입니다.`
        });
      }
    }

    const creditToMarketCapRatio = creditToMarketCapRatioByDate.get(date) ?? null;
    if (creditToMarketCapRatio !== null) {
      const historicalRatios = sortedKospi
        .slice(0, i)
        .map((r) => creditToMarketCapRatioByDate.get(r.trade_date) ?? null)
        .filter((v): v is number => typeof v === "number");
      const p95 = historicalRatios.length >= 60 ? percentile(historicalRatios, 0.95) : null;
      if (p95 !== null && creditToMarketCapRatio > p95) {
        const p99 = percentile(historicalRatios, 0.99);
        const isExtreme = p99 !== null && creditToMarketCapRatio > p99;
        const scoreDelta = isExtreme ? 10 : 7;
        leverageScore += scoreDelta;
        daySignals.push({
          trade_date: date,
          signal_type: "credit_to_market_cap_ratio_high",
          severity: isExtreme ? "warning" : "caution",
          score_delta: scoreDelta,
          title: "신용융자/시가총액 비율 과열",
          description: `신용융자/KOSPI+KOSDAQ 시가총액 비율이 ${creditToMarketCapRatio.toFixed(3)}%로 과거 95% 분위(${p95.toFixed(3)}%)를 초과했습니다.`
        });
      }
    }

    leverageScore = Math.min(25, leverageScore);

    if (debug && i >= Math.max(0, sortedKospi.length - 10)) {
      console.log("[LEVERAGE_DEBUG]", {
        tradeDate: date,
        creditLoan,
        creditLoanHigh60,
        creditLoanToHighRatio,
        creditLoan20dChange,
        totalCredit,
        totalCreditHigh60,
        creditToDepositRatio,
        creditToMarketCapRatio,
        leverageScore
      });
    }

    const cma = cmaByDate.get(date);
    if (cma?.cma_balance_million_krw !== null && cma?.cma_balance_million_krw !== undefined) {
      const recent20 = sortedKospi
        .slice(Math.max(0, i - 19), i + 1)
        .map((r) => cmaByDate.get(r.trade_date)?.cma_balance_million_krw ?? null)
        .filter((v): v is number => typeof v === "number");
      if (recent20.length === 20 && cma.cma_balance_million_krw < avg(recent20)) {
        cmaScore += 10;
        daySignals.push({
          trade_date: date,
          signal_type: "cma_below_20d_average",
          severity: "caution",
          score_delta: 10,
          title: "CMA 잔고 20일 평균 하회",
          description: "CMA 잔고가 최근 20거래일 평균 아래로 내려왔습니다."
        });
      }
    }
    cmaScore = Math.min(10, cmaScore);

    const last5KospiDates = sortedKospi.slice(Math.max(0, i - 4), i + 1).map((r) => r.trade_date);
    const foreign5 = last5KospiDates.map((d) => {
      const flow = flowByDate.get(d);
      return flow ? flow.foreign : null;
    });
    if (foreign5.length === 5 && foreign5.every((v) => v !== null && v < 0)) {
      flowScore += 12;
      daySignals.push({
        trade_date: date,
        signal_type: "foreigner_net_sell_5d",
        severity: "warning",
        score_delta: 12,
        title: "외국인 5거래일 연속 순매도",
        description: "외국인이 KOSPI 기준 5거래일 연속 순매도를 기록했습니다."
      });
    }
    const todayFlow = flowByDate.get(date);
    const foreignToday = todayFlow?.foreign;
    const instToday = todayFlow?.institution;
    if (typeof foreignToday === "number" && typeof instToday === "number" && foreignToday < 0 && instToday < 0) {
      flowScore += 8;
      daySignals.push({
        trade_date: date,
        signal_type: "foreigner_institution_net_sell",
        severity: "caution",
        score_delta: 8,
        title: "외국인·기관 동시 순매도",
        description: "외국인과 기관이 같은 날 동시에 순매도했습니다."
      });
    }
    flowScore = Math.min(20, flowScore);

    const ma = maMap.get(date);
    if (ma?.ma20 !== null && ma?.ma20 !== undefined && kospi.close < ma.ma20) {
      technicalScore += 7;
      daySignals.push({
        trade_date: date,
        signal_type: "kospi_below_ma20",
        severity: "caution",
        score_delta: 7,
        title: "KOSPI 20일선 이탈",
        description: "KOSPI가 20일 이동평균선을 하회했습니다."
      });
    }
    if (ma?.ma60 !== null && ma?.ma60 !== undefined && kospi.close < ma.ma60 && isConfirmedKospiMa60Break(sortedKospi, maMap, i)) {
      technicalScore += 13;
      daySignals.push({
        trade_date: date,
        signal_type: "kospi_below_ma60",
        severity: "danger",
        score_delta: 13,
        title: "KOSPI 60일선 이탈",
        description: "KOSPI가 60일 이동평균선을 하회했습니다. 추세 훼손 가능성이 커졌습니다."
      });
    }
    technicalScore = Math.min(20, technicalScore);

    const totalScore = Math.min(100, liquidityScore + leverageScore + cmaScore + flowScore + technicalScore);
    const riskLevel = getRiskLevel(totalScore);
    risks.push({
      trade_date: date,
      liquidity_score: liquidityScore,
      leverage_score: leverageScore,
      cma_score: cmaScore,
      flow_score: flowScore,
      technical_score: technicalScore,
      total_score: totalScore,
      risk_level: riskLevel,
      summary: buildSummary({
        totalScore,
        riskLevel,
        liquidityScore,
        leverageScore,
        cmaScore,
        flowScore,
        technicalScore
      })
    });
    signals.push(...daySignals);
  }

  return { risks, signals };
}
