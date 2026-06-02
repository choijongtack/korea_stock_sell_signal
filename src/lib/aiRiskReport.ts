import "server-only";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildConditionStatus, buildRawScoreBreakdown, CATEGORY_CAPS, SCORE_RULES_FOR_REPORT, summarizeSignalGroups } from "@/lib/signalAnalysis";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { RiskLevel, SignalEvent } from "@/types/market";

export type RiskReportInput = {
  tradeDate?: string | null;
  totalScore: number;
  riskLevel: RiskLevel;
  liquidityScore?: number;
  leverageScore?: number;
  flowScore?: number;
  technicalScore?: number;
  cmaScore?: number;
  summary?: string | null;
  signals: SignalEvent[];
  reportVersionDate?: string | null;
};

export type RiskReportSection = {
  title: string;
  body: string;
};

export type RiskReportAction = {
  label: string;
  detail: string;
};

export type RiskReport = {
  source: "openai" | "fallback";
  headline: string;
  phase: string;
  summary: string;
  sections: RiskReportSection[];
  actions: RiskReportAction[];
  caveat: string;
};

type CachedRiskReport = {
  reportDate: string;
  promptVersion: string;
  inputHash: string;
  generatedAt: string;
  report: RiskReport;
};

const REPORT_CACHE_DIR = path.join(process.cwd(), ".cache", "ai-risk-reports");
const REPORT_PROMPT_VERSION = "risk-report-v3";
const RISK_REPORT_INSTRUCTIONS =
  "You are a market risk analyst with more than 20 years of experience analyzing Korean equity market flows, margin credit, and liquidity indicators. Your goal is not to recommend investments, but to interpret market fragility, overheating, and flow divergence from evidence. Use only the supplied metrics, score rules, condition status, raw score breakdown, category caps, and signal groups. Do not infer missing data. Do not give definitive buy or sell instructions; express conclusions as risk management scenarios. Write the report in Korean. Return only JSON matching the schema. Explain the score in plain language: triggered conditions, non-triggered conditions, why the same metric can affect liquidity and leverage separately, category caps, and why risk improved or worsened versus the previous evaluation when score_change is available. Never mention foreign selling, institutional selling, or flow deterioration unless condition_status has a triggered foreign/institution flow condition or signal_groups contains a flow category.";

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "phase", "summary", "sections", "actions", "caveat"],
  properties: {
    headline: { type: "string" },
    phase: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body"],
        properties: {
          title: { type: "string" },
          body: { type: "string" }
        }
      }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: { type: "string" },
          detail: { type: "string" }
        }
      }
    },
    caveat: { type: "string" }
  }
} as const;

function normalizeReportInput(input: RiskReportInput) {
  const signalGroups = summarizeSignalGroups(input.signals);
  const conditionStatus = buildConditionStatus(input.signals);
  const rawScoreBreakdown = buildRawScoreBreakdown(input.signals);

  return {
    tradeDate: input.tradeDate ?? null,
    score: {
      total: input.totalScore,
      level: input.riskLevel,
      liquidity: input.liquidityScore ?? 0,
      leverage: input.leverageScore ?? 0,
      flow: input.flowScore ?? 0,
      technical: input.technicalScore ?? 0,
      cma: input.cmaScore ?? 0
    },
    summary: input.summary ?? null,
    score_rules: SCORE_RULES_FOR_REPORT,
    condition_status: conditionStatus,
    raw_score_breakdown: rawScoreBreakdown,
    category_caps: CATEGORY_CAPS,
    signal_groups: signalGroups.map((group) => ({
      category: group.title,
      score: group.score,
      signalCount: group.signalCount,
      summary: group.summary,
      signalCodes: group.signalCodes
    })),
    signals: input.signals
      .map((signal) => ({
        date: signal.tradeDate,
        code: signal.signalCode ?? signal.signalType,
        title: signal.title ?? null,
        severity: signal.severity ?? null,
        score: signal.triggerScore,
        reason: signal.triggerReason
      }))
      .sort((a, b) => `${a.date}:${a.reason}`.localeCompare(`${b.date}:${b.reason}`))
  };
}

type PreviousRiskSnapshot = {
  tradeDate: string | null;
  totalScore: number;
  liquidityScore: number;
  leverageScore: number;
  flowScore: number;
  technicalScore: number;
  cmaScore: number;
} | null;

async function fetchPreviousRiskSnapshot(tradeDate?: string | null): Promise<PreviousRiskSnapshot> {
  if (!tradeDate) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("market_risk_daily")
      .select("trade_date,total_score,liquidity_score,leverage_score,flow_score,technical_score,cma_score")
      .lt("trade_date", tradeDate)
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      tradeDate: data.trade_date ?? null,
      totalScore: data.total_score ?? 0,
      liquidityScore: data.liquidity_score ?? 0,
      leverageScore: data.leverage_score ?? 0,
      flowScore: data.flow_score ?? 0,
      technicalScore: data.technical_score ?? 0,
      cmaScore: data.cma_score ?? 0
    };
  } catch {
    return null;
  }
}

function getInputHash(input: RiskReportInput) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizeReportInput(input))).digest("hex");
}

function getReportDate(input: RiskReportInput) {
  return input.reportVersionDate ?? input.tradeDate ?? "latest";
}

function getCachePath(reportDate: string) {
  return path.join(REPORT_CACHE_DIR, `${reportDate}.json`);
}

function isRiskReport(value: unknown): value is RiskReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Partial<RiskReport>;
  return (
    (report.source === "openai" || report.source === "fallback") &&
    typeof report.headline === "string" &&
    typeof report.phase === "string" &&
    typeof report.summary === "string" &&
    Array.isArray(report.sections) &&
    Array.isArray(report.actions) &&
    typeof report.caveat === "string"
  );
}

async function readCachedReport(cachePath: string, reportDate: string, inputHash: string): Promise<RiskReport | null> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8")) as Partial<CachedRiskReport>;
    if (
      parsed.reportDate === reportDate &&
      parsed.promptVersion === REPORT_PROMPT_VERSION &&
      parsed.inputHash === inputHash &&
      isRiskReport(parsed.report)
    ) {
      return parsed.report;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCachedReport(cachePath: string, reportDate: string, inputHash: string, report: RiskReport) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const payload: CachedRiskReport = {
    reportDate,
    promptVersion: REPORT_PROMPT_VERSION,
    inputHash,
    generatedAt: new Date().toISOString(),
    report
  };
  await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readStoredReport(reportDate: string, inputHash: string): Promise<RiskReport | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("market_risk_ai_reports")
      .select("report,input_hash")
      .eq("report_date", reportDate)
      .eq("prompt_version", REPORT_PROMPT_VERSION)
      .maybeSingle();
    if (error || !data) return null;
    if (data.input_hash !== inputHash) return null;
    return isRiskReport(data.report) ? data.report : null;
  } catch {
    return null;
  }
}

async function writeStoredReport(reportDate: string, inputHash: string, report: RiskReport) {
  try {
    await getSupabaseAdmin().from("market_risk_ai_reports").upsert(
      {
        report_date: reportDate,
        prompt_version: REPORT_PROMPT_VERSION,
        input_hash: inputHash,
        model: process.env.OPENAI_RISK_REPORT_MODEL ?? "gpt-4o-mini",
        source: report.source,
        report,
        updated_at: new Date().toISOString()
      },
      { onConflict: "report_date,prompt_version" }
    );
  } catch {
    // The table may not exist before the migration is applied. File cache still works.
  }
}

function buildFallbackReport(input: RiskReportInput, previous: PreviousRiskSnapshot): RiskReport {
  const headline =
    input.totalScore >= 85
      ? "Market risk is in a crisis zone"
      : input.totalScore >= 60
        ? "Leverage overheating and foreign selling are active risk signals"
        : input.totalScore >= 40
          ? "Market risk is elevated"
          : "Major market risk signals remain limited";

  const sections: RiskReportSection[] = [
    {
      title: "Overall assessment",
      body: `${input.tradeDate ?? "Latest date"} risk score is ${input.totalScore} (${input.riskLevel}). ${
        input.summary ?? "No stored summary is available."
      }`
    },
    {
      title: "Leverage and flow",
      body: "The supplied signals should be checked for margin credit overheating, cash-buffer quality, and foreign investor selling pressure."
    },
    {
      title: "Trend confirmation",
      body: "If technical trend damage is still limited, this report should be read as a pre-break fragility warning rather than a post-break confirmation."
    }
  ];

  if (previous) {
    const delta = input.totalScore - previous.totalScore;
    if (delta !== 0) {
      sections.splice(1, 0, {
        title: "점수 변동 원인",
        body: `이전 평가(${previous.tradeDate ?? "N/A"}) 대비 총점이 ${delta > 0 ? "+" : ""}${delta} 변했습니다. 세부 점수(유동성/레버리지/수급/기술/CMA) 변화와 신호 증감을 중심으로 변동 원인을 점검해야 합니다.`
      });
    }
  }

  return {
    source: "fallback",
    headline,
    phase: input.totalScore >= 60 ? "Risk management scenario" : "Monitoring",
    summary: sections.map((section) => section.body).join(" "),
    sections,
    actions:
      input.totalScore >= 60
        ? [
            { label: "Pause new risk", detail: "Avoid adding exposure until the risk score and leverage signals cool down." },
            { label: "Review leverage", detail: "Check margin credit, unsettled trades, and collateral buffers first." },
            { label: "Raise liquidity", detail: "Review highly extended or volatile holdings before weaker positions become forced sales." }
          ]
        : [
            { label: "Monitor signals", detail: "Watch the credit-to-deposit ratio and foreign net selling streak." },
            { label: "Keep staged responses", detail: "Increase risk reduction only when warning signals broaden." }
          ],
    caveat: "This report interprets supplied market risk indicators and does not replace individual investment judgment."
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

async function tryOpenAiReport(input: RiskReportInput, previous: PreviousRiskSnapshot): Promise<RiskReport | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const normalizedInput = normalizeReportInput(input);
    const scoreChange = previous
      ? {
          total: normalizedInput.score.total - previous.totalScore,
          liquidity: normalizedInput.score.liquidity - previous.liquidityScore,
          leverage: normalizedInput.score.leverage - previous.leverageScore,
          flow: normalizedInput.score.flow - previous.flowScore,
          technical: normalizedInput.score.technical - previous.technicalScore,
          cma: normalizedInput.score.cma - previous.cmaScore
        }
      : null;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RISK_REPORT_MODEL ?? "gpt-4o-mini",
        instructions: RISK_REPORT_INSTRUCTIONS,
        input: JSON.stringify({
          ...normalizedInput,
          previous_evaluation: previous,
          score_change: scoreChange
        }),
        text: {
          format: {
            type: "json_schema",
            name: "market_risk_report",
            strict: true,
            schema: REPORT_SCHEMA
          }
        }
      })
    });

    if (!response.ok) return null;
    const outputText = extractOutputText(await response.json());
    if (!outputText) return null;
    const parsed = JSON.parse(outputText);
    return isRiskReport({ ...parsed, source: "openai" }) ? { ...parsed, source: "openai" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateRiskReport(input: RiskReportInput): Promise<RiskReport> {
  return generateRiskReportWithOptions(input, { forceRefresh: false });
}

export async function generateRiskReportWithOptions(
  input: RiskReportInput,
  options: { forceRefresh?: boolean } = {}
): Promise<RiskReport> {
  const reportDate = getReportDate(input);
  const inputHash = getInputHash(input);
  const cachePath = getCachePath(reportDate);
  const previous = await fetchPreviousRiskSnapshot(input.tradeDate);
  const forceRefresh = options.forceRefresh === true;
  if (!forceRefresh) {
    const stored = await readStoredReport(reportDate, inputHash);
    if (stored) return stored;

    const cached = await readCachedReport(cachePath, reportDate, inputHash);
    if (cached) return cached;
  }

  const report = (await tryOpenAiReport(input, previous)) ?? buildFallbackReport(input, previous);
  await writeStoredReport(reportDate, inputHash, report);
  await writeCachedReport(cachePath, reportDate, inputHash, report);
  return report;
}
