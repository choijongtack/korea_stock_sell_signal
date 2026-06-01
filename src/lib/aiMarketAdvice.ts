import "server-only";
import { isAdminMode } from "@/lib/adminAuth";
import { runBacktestValidation } from "@/lib/backtestEngine";
import {
  fetchInvestorFlowDaily,
  fetchLatestMarketRiskDaily,
  fetchLatestSignalEvents,
  fetchMarketCmaDaily,
  fetchMarketCreditBalanceDaily,
  fetchMarketIndexDaily,
  fetchMarketLiquidityDaily
} from "@/lib/fetchMarketData";

type AdviceSource = "openai" | "fallback";
type AdviceMode = "general" | "app_context" | "backtest_context";

export type MarketAdviceMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MarketAdviceResponse = {
  source: AdviceSource;
  mode: AdviceMode;
  answer: string;
  basisDates: string[];
  referencedIndicators: string[];
};

type NumericPoint = {
  tradeDate: string;
  value: number | null;
};

type MarketAdviceOptions = {
  includeBacktest?: boolean;
  currentPath?: string;
};

const GENERAL_INSTRUCTIONS =
  "You are a helpful assistant in a Korean stock dashboard app. Answer the user's general question naturally in Korean. Do not force market analysis when the question is unrelated. If the user asks about this app, its market signals, risk score, portfolio, or backtest, explain that you can use the app context for those questions.";

const APP_CONTEXT_INSTRUCTIONS =
  "You are a Korean equity market risk assistant. Answer in Korean. Use only the supplied dashboard context and conversation. Do not invent missing data. Do not give definitive buy/sell orders. Frame the answer as risk diagnosis, evidence, and scenarios. Keep the answer concise but useful. Always mention the relevant data dates when they matter.";

const BACKTEST_CONTEXT_INSTRUCTIONS =
  "You are a Korean equity market risk assistant. Answer in Korean. Use only the supplied dashboard context, backtest context, and conversation. Do not invent missing data. Do not give definitive buy/sell orders. Frame the answer as risk diagnosis, evidence, and scenarios. If backtestContext is available, explain what the validation says about signal reliability, false signals, and forward returns. Keep the answer concise but useful. Always mention the relevant data dates or tested sample counts when they matter.";

const BACKTEST_KEYWORDS = ["backtest", "백테스트", "검증", "성공률", "forward", "5d", "20d", "sell/reduce", "reduce", "action"];
const APP_CONTEXT_KEYWORDS = [
  "이 앱",
  "앱",
  "대시보드",
  "위험 점수",
  "위험도",
  "매도 위험",
  "시그널",
  "신호",
  "수급",
  "외국인",
  "기관",
  "개인",
  "지수",
  "kospi",
  "kosdaq",
  "kospi200",
  "신용",
  "신용잔고",
  "유동성",
  "예탁금",
  "cma",
  "포트폴리오",
  "보유",
  "종목"
];

function includesAny(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function classifyAdviceMode(question: string, currentPath = "", includeBacktest = false): AdviceMode {
  const combined = `${question} ${currentPath}`;
  if (includeBacktest || currentPath.includes("/backtest") || includesAny(combined, BACKTEST_KEYWORDS)) return "backtest_context";
  if (currentPath !== "/" && currentPath !== "" && currentPath !== "/admin") return "app_context";
  if (includesAny(combined, APP_CONTEXT_KEYWORDS)) return "app_context";
  return "general";
}

function last<T>(rows: T[]): T | undefined {
  return rows[rows.length - 1];
}

function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function numberChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100) / 100;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function successRate(values: Array<boolean | null>): number | null {
  const filtered = values.filter((value): value is boolean => value !== null);
  if (filtered.length === 0) return null;
  return Math.round((filtered.filter(Boolean).length / filtered.length) * 10000) / 100;
}

function scoreBucket(score: number): "0-39" | "40-59" | "60-74" | "75-84" | "85+" {
  if (score >= 85) return "85+";
  if (score >= 75) return "75-84";
  if (score >= 60) return "60-74";
  if (score >= 40) return "40-59";
  return "0-39";
}

function summarizePointSeries(rows: NumericPoint[], lookback = 20) {
  const latest = last(rows);
  const previous = rows.length > lookback ? rows[rows.length - lookback - 1] : rows[0];

  return {
    latestDate: latest?.tradeDate ?? null,
    latestValue: latest?.value ?? null,
    lookbackDate: previous?.tradeDate ?? null,
    change: numberChange(latest?.value, previous?.value),
    changePct: pctChange(latest?.value, previous?.value)
  };
}

function compactSignals(signals: Awaited<ReturnType<typeof fetchLatestSignalEvents>>) {
  return signals.slice(0, 8).map((signal) => ({
    date: signal.tradeDate,
    score: signal.triggerScore,
    reason: signal.triggerReason
  }));
}

async function buildBacktestAdviceContext() {
  const result = await runBacktestValidation();
  const rows = result.rows;
  const sellReduceRows = rows.filter((row) => row.action === "sell" || row.action === "reduce");
  const bucketOrder: Array<"0-39" | "40-59" | "60-74" | "75-84" | "85+"> = ["0-39", "40-59", "60-74", "75-84", "85+"];

  return {
    dataSource: result.dataSource,
    diagnostics: result.diagnostics,
    dateRange:
      rows.length > 0
        ? {
            from: rows[0].trade_date,
            to: rows[rows.length - 1].trade_date
          }
        : null,
    sellReduceValidation: {
      days: sellReduceRows.length,
      avgMarketReturn5d: avg(sellReduceRows.map((row) => row.market_return_5d).filter((value): value is number => value !== null)),
      avgMarketReturn20d: avg(sellReduceRows.map((row) => row.market_return_20d).filter((value): value is number => value !== null)),
      successRate5d: successRate(sellReduceRows.map((row) => row.is_success_5d)),
      successRate20d: successRate(sellReduceRows.map((row) => row.is_success_20d))
    },
    actionValidation: result.summary.map((row) => ({
      action: row.action,
      horizon: row.horizon,
      samples: row.samples,
      successRatePct: row.successRatePct,
      avgMarketReturnPct: row.avgMarketReturnPct,
      avgStrategyReturnPct: row.avgStrategyReturnPct
    })),
    riskScoreBuckets: bucketOrder.map((bucket) => {
      const group = rows.filter((row) => scoreBucket(row.score) === bucket);
      return {
        bucket,
        days: group.length,
        avgMarketReturn5d: avg(group.map((row) => row.market_return_5d).filter((value): value is number => value !== null)),
        avgMarketReturn20d: avg(group.map((row) => row.market_return_20d).filter((value): value is number => value !== null)),
        successRate5d: successRate(group.map((row) => row.is_success_5d)),
        successRate20d: successRate(group.map((row) => row.is_success_20d))
      };
    }),
    signalTypeValidation: {
      byTypeSeverity: result.signalTypeValidation.byTypeSeverity.slice(0, 20),
      byTypeSeverityRegime: result.signalTypeValidation.byTypeSeverityRegime.slice(0, 20)
    }
  };
}

function extractOutputText(responseJson: unknown): string | null {
  if (typeof responseJson !== "object" || responseJson === null) return null;
  const direct = (responseJson as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (responseJson as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const contentItem of content) {
      if (typeof contentItem !== "object" || contentItem === null) continue;
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

async function buildMarketAdviceContext(options: MarketAdviceOptions = {}) {
  const [risk, signals, liquidity, credit, cma, indexRows, flowRows] = await Promise.all([
    fetchLatestMarketRiskDaily(),
    fetchLatestSignalEvents(),
    fetchMarketLiquidityDaily(),
    fetchMarketCreditBalanceDaily(),
    fetchMarketCmaDaily(),
    fetchMarketIndexDaily(),
    fetchInvestorFlowDaily()
  ]);

  const indexByMarket = new Map<string, NumericPoint[]>();
  indexRows.forEach((row) => {
    const rows = indexByMarket.get(row.market) ?? [];
    rows.push({ tradeDate: row.tradeDate, value: row.close });
    indexByMarket.set(row.market, rows);
  });

  const flowByDate = new Map<
    string,
    {
      tradeDate: string;
      foreignNetBuy: number;
      institutionNetBuy: number;
      individualNetBuy: number;
      programNetBuy: number;
    }
  >();
  flowRows.forEach((row) => {
    const item =
      flowByDate.get(row.tradeDate) ??
      ({
        tradeDate: row.tradeDate,
        foreignNetBuy: 0,
        institutionNetBuy: 0,
        individualNetBuy: 0,
        programNetBuy: 0
      } satisfies {
        tradeDate: string;
        foreignNetBuy: number;
        institutionNetBuy: number;
        individualNetBuy: number;
        programNetBuy: number;
      });
    item.foreignNetBuy += row.foreignNetBuy ?? 0;
    item.institutionNetBuy += row.institutionNetBuy ?? 0;
    item.individualNetBuy += row.individualNetBuy ?? 0;
    item.programNetBuy += row.programNetBuy ?? 0;
    flowByDate.set(row.tradeDate, item);
  });
  const flowSeries = Array.from(flowByDate.values()).sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  const latestLiquidity = last(liquidity);
  const previousLiquidity = liquidity.length > 20 ? liquidity[liquidity.length - 21] : liquidity[0];
  const latestCredit = last(credit);
  const previousCredit = credit.length > 20 ? credit[credit.length - 21] : credit[0];
  const latestCma = last(cma);
  const previousCma = cma.length > 20 ? cma[cma.length - 21] : cma[0];
  const latestFlow = last(flowSeries);
  const previousFlow = flowSeries.length > 20 ? flowSeries[flowSeries.length - 21] : flowSeries[0];

  let backtest:
    | { available: true; data: Awaited<ReturnType<typeof buildBacktestAdviceContext>> }
    | { available: false; reason: string }
    | null = null;

  if (options.includeBacktest) {
    if (await isAdminMode()) {
      try {
        backtest = { available: true, data: await buildBacktestAdviceContext() };
      } catch (error) {
        backtest = {
          available: false,
          reason: error instanceof Error ? error.message : "Backtest context could not be loaded."
        };
      }
    } else {
      backtest = { available: false, reason: "Backtest context requires admin access." };
    }
  }

  const context = {
    generatedAt: new Date().toISOString(),
    latestRisk: risk
      ? {
          date: risk.tradeDate,
          totalScore: risk.totalScore,
          riskLevel: risk.riskLevel,
          liquidityScore: risk.liquidityScore,
          leverageScore: risk.leverageScore,
          flowScore: risk.flowScore,
          technicalScore: risk.technicalScore,
          cmaScore: risk.cmaScore,
          summary: risk.summary
        }
      : null,
    latestSignals: compactSignals(signals),
    index: Object.fromEntries(Array.from(indexByMarket.entries()).map(([market, rows]) => [market, summarizePointSeries(rows)])),
    liquidity: {
      latestDate: latestLiquidity?.tradeDate ?? null,
      investorDepositMillionKrw: latestLiquidity?.investorDepositMillionKrw ?? null,
      investorDeposit20dChangePct: pctChange(latestLiquidity?.investorDepositMillionKrw, previousLiquidity?.investorDepositMillionKrw),
      derivativesDepositMillionKrw: latestLiquidity?.derivativesDepositMillionKrw ?? null,
      rpBalanceMillionKrw: latestLiquidity?.rpBalanceMillionKrw ?? null,
      unsettledBalanceMillionKrw: latestLiquidity?.unsettledBalanceMillionKrw ?? null
    },
    credit: {
      latestDate: latestCredit?.tradeDate ?? null,
      totalCreditMillionKrw: latestCredit?.totalCreditMillionKrw ?? null,
      totalCredit20dChangePct: pctChange(latestCredit?.totalCreditMillionKrw, previousCredit?.totalCreditMillionKrw),
      creditLoanMillionKrw: latestCredit?.creditLoanMillionKrw ?? null,
      collateralLoanMillionKrw: latestCredit?.collateralLoanMillionKrw ?? null
    },
    cma: {
      latestDate: latestCma?.tradeDate ?? null,
      totalMillionKrw: latestCma?.totalMillionKrw ?? null,
      total20dChangePct: pctChange(latestCma?.totalMillionKrw, previousCma?.totalMillionKrw)
    },
    flow: {
      latestDate: latestFlow?.tradeDate ?? null,
      foreignNetBuy: latestFlow?.foreignNetBuy ?? null,
      foreignNetBuy20dChange: numberChange(latestFlow?.foreignNetBuy, previousFlow?.foreignNetBuy),
      institutionNetBuy: latestFlow?.institutionNetBuy ?? null,
      individualNetBuy: latestFlow?.individualNetBuy ?? null,
      programNetBuy: latestFlow?.programNetBuy ?? null
    },
    backtest
  };

  const basisDates = Array.from(
    new Set(
      [
        context.latestRisk?.date,
        context.liquidity.latestDate,
        context.credit.latestDate,
        context.cma.latestDate,
        context.flow.latestDate,
        ...Object.values(context.index).map((item) => item.latestDate)
      ].filter((value): value is string => Boolean(value))
    )
  ).sort();

  return { context, basisDates };
}

function buildGeneralFallbackAdvice(question: string): string {
  return `질문("${question}")에 답변을 생성하지 못했습니다. 일반 질문은 자유롭게 다시 물어보셔도 되고, 앱의 위험 점수/시그널/백테스트에 대한 질문이면 해당 데이터를 기준으로 설명할 수 있습니다.`;
}

function buildFallbackAdvice(question: string, context: Awaited<ReturnType<typeof buildMarketAdviceContext>>["context"]): string {
  const risk = context.latestRisk;
  const riskLine = risk ? `최신 위험 점수는 ${risk.totalScore}점(${risk.riskLevel})이고 기준일은 ${risk.date}입니다.` : "저장된 최신 위험 점수 데이터가 없습니다.";
  const signalLine =
    context.latestSignals.length > 0
      ? `최근 신호는 ${context.latestSignals[0].date} 기준 ${context.latestSignals.length}건이며, 대표 사유는 "${context.latestSignals[0].reason}"입니다.`
      : "최근 발생 신호는 없습니다.";

  const backtestLine =
    context.backtest?.available === true
      ? `백테스트는 ${context.backtest.data.diagnostics.matchedDays}개 매칭 일수를 검증했고, sell/reduce 5D 성공률은 ${context.backtest.data.sellReduceValidation.successRate5d ?? "-"}%입니다.`
      : context.backtest?.available === false
        ? `백테스트 요약은 포함되지 않았습니다: ${context.backtest.reason}`
        : "";

  return `${riskLine} ${signalLine} ${backtestLine} 질문("${question}")에 대해서는 지수, 수급, 신용/유동성 지표와 백테스트 검증 결과를 함께 확인해야 합니다. 현재 자동 AI 응답을 생성하지 못해 기본 요약만 제공합니다. 단정적인 매수/매도보다 비중 조절과 리스크 점검 시나리오로 접근하세요.`;
}

export async function generateMarketAdvice(question: string, messages: MarketAdviceMessage[] = [], options: MarketAdviceOptions = {}): Promise<MarketAdviceResponse> {
  const mode = classifyAdviceMode(question, options.currentPath, options.includeBacktest);
  const apiKey = process.env.OPENAI_API_KEY;
  const conversation = messages.slice(-8).map((message) => ({
    role: message.role,
    content: message.content
  }));

  if (mode === "general") {
    if (!apiKey) {
      return {
        source: "fallback",
        mode,
        answer: buildGeneralFallbackAdvice(question),
        basisDates: [],
        referencedIndicators: []
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_RISK_REPORT_MODEL ?? "gpt-4o-mini",
          instructions: GENERAL_INSTRUCTIONS,
          input: JSON.stringify({ question, conversation })
        })
      });

      if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
      const answer = extractOutputText(await response.json());
      if (!answer) throw new Error("OpenAI response was empty.");

      return {
        source: "openai",
        mode,
        answer,
        basisDates: [],
        referencedIndicators: []
      };
    } catch {
      return {
        source: "fallback",
        mode,
        answer: buildGeneralFallbackAdvice(question),
        basisDates: [],
        referencedIndicators: []
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const { context, basisDates } = await buildMarketAdviceContext({ includeBacktest: mode === "backtest_context" });
  const referencedIndicators = [
    "market_risk_daily",
    "signal_events",
    "market_index_daily",
    "investor_flow_daily",
    "market_liquidity_daily",
    "market_credit_balance_daily",
    "market_cma_daily",
    ...(context.backtest?.available ? ["backtest_results"] : [])
  ];

  if (!apiKey) {
    return {
      source: "fallback",
      mode,
      answer: buildFallbackAdvice(question, context),
      basisDates,
      referencedIndicators
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RISK_REPORT_MODEL ?? "gpt-4o-mini",
        instructions: mode === "backtest_context" ? BACKTEST_CONTEXT_INSTRUCTIONS : APP_CONTEXT_INSTRUCTIONS,
        input: JSON.stringify({
          question,
          conversation,
          dashboardContext: context
        })
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const answer = extractOutputText(await response.json());
    if (!answer) throw new Error("OpenAI response was empty.");

    return {
      source: "openai",
      mode,
      answer,
      basisDates,
      referencedIndicators
    };
  } catch {
    return {
      source: "fallback",
      mode,
      answer: buildFallbackAdvice(question, context),
      basisDates,
      referencedIndicators
    };
  } finally {
    clearTimeout(timeout);
  }
}
