import "server-only";
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

const RISK_REPORT_INSTRUCTIONS =
  "You are a market risk analyst with more than 20 years of experience analyzing Korean equity market flows, margin credit, and liquidity indicators. Your goal is not to recommend investments, but to interpret market fragility, overheating, and flow divergence from evidence. Use only the supplied metrics and signals. Do not infer missing data. Do not give definitive buy or sell instructions; express conclusions as risk management scenarios. Write the report in Korean. Return only JSON matching the schema.";

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

function buildFallbackReport(input: RiskReportInput): RiskReport {
  const signalText = input.signals.map((signal) => signal.triggerReason).join(" ");
  const hasCreditRisk = signalText.includes("credit") || signalText.includes("Credit") || signalText.includes("신용");
  const hasForeignSelling = signalText.includes("foreign") || signalText.includes("Foreign") || signalText.includes("외국인");
  const hasDivergence = signalText.includes("divergence") || signalText.includes("Divergence") || signalText.includes("괴리");
  const hasTrendBreak = signalText.includes("MA") || signalText.includes("이평") || signalText.includes("추세");

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
    }
  ];

  if (hasCreditRisk) {
    sections.push({
      title: "Leverage risk",
      body: "Credit-related signals are active, so the market may be more sensitive to downside shocks than the headline index trend suggests."
    });
  }

  if (hasForeignSelling || hasDivergence) {
    sections.push({
      title: "Flow divergence",
      body: "Foreign selling combined with elevated margin credit can indicate a fragile distribution phase."
    });
  }

  sections.push({
    title: "Trend confirmation",
    body: hasTrendBreak
      ? "Technical trend damage is also present, so the risk is confirmed by lagging trend indicators."
      : "Technical trend damage is still limited, so this report emphasizes pre-break fragility rather than post-break confirmation."
  });

  return {
    source: "fallback",
    headline,
    phase: hasDivergence ? "Distribution risk" : hasCreditRisk ? "Leverage fragility" : "Monitoring",
    summary: sections.map((section) => section.body).join(" "),
    sections: sections.slice(0, 4),
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

async function tryOpenAiReport(input: RiskReportInput): Promise<RiskReport | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

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
        instructions: RISK_REPORT_INSTRUCTIONS,
        input: JSON.stringify({
          tradeDate: input.tradeDate,
          score: {
            total: input.totalScore,
            level: input.riskLevel,
            liquidity: input.liquidityScore,
            leverage: input.leverageScore,
            flow: input.flowScore,
            technical: input.technicalScore,
            cma: input.cmaScore
          },
          summary: input.summary,
          signals: input.signals.map((signal) => ({
            date: signal.tradeDate,
            score: signal.triggerScore,
            reason: signal.triggerReason
          }))
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
    const json = await response.json();
    const outputText = extractOutputText(json);
    if (!outputText) return null;
    return { ...JSON.parse(outputText), source: "openai" } as RiskReport;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateRiskReport(input: RiskReportInput): Promise<RiskReport> {
  return (await tryOpenAiReport(input)) ?? buildFallbackReport(input);
}
