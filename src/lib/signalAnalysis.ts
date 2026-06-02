import type { SignalEvent } from "@/types/market";

export type SignalGroupId = "liquidity" | "leverage" | "flow" | "technical" | "cma" | "other";

export type SignalGroupSummary = {
  id: SignalGroupId;
  title: string;
  score: number;
  signalCount: number;
  summary: string;
  details: string[];
  signalCodes: string[];
};

export type RawScoreBreakdown = {
  liquidity: number;
  leverage: number;
  flow: number;
  technical: number;
  cma: number;
  other: number;
};

const GROUP_LABELS: Record<SignalGroupId, string> = {
  liquidity: "유동성",
  leverage: "레버리지",
  flow: "수급",
  technical: "기술적 추세",
  cma: "CMA",
  other: "기타"
};

const CODE_TO_GROUP: Record<string, SignalGroupId> = {
  deposit_drawdown_60d: "liquidity",
  liquidity_quality_credit_to_deposit_high: "liquidity",
  credit_to_deposit_ratio_high: "liquidity",
  credit_loan_10d_drop: "leverage",
  credit_down_kospi_down: "leverage",
  credit_loan_near_60d_high: "leverage",
  credit_loan_20d_rise: "leverage",
  credit_loan_acceleration_near_high: "leverage",
  total_credit_near_60d_high: "leverage",
  credit_to_market_cap_ratio_high: "leverage",
  foreigner_net_sell_5d: "flow",
  foreigner_sell_credit_high_divergence: "flow",
  foreigner_institution_net_sell: "flow",
  kospi_below_ma20: "technical",
  kospi_below_ma60: "technical",
  cma_below_20d_average: "cma"
};

const CODE_TO_SCORE_CATEGORY: Record<string, keyof RawScoreBreakdown> = {
  deposit_drawdown_60d: "liquidity",
  liquidity_quality_credit_to_deposit_high: "liquidity",
  credit_to_deposit_ratio_high: "leverage",
  credit_loan_10d_drop: "leverage",
  credit_down_kospi_down: "leverage",
  credit_loan_near_60d_high: "leverage",
  credit_loan_20d_rise: "leverage",
  credit_loan_acceleration_near_high: "leverage",
  total_credit_near_60d_high: "leverage",
  credit_to_market_cap_ratio_high: "leverage",
  foreigner_net_sell_5d: "flow",
  foreigner_sell_credit_high_divergence: "flow",
  foreigner_institution_net_sell: "flow",
  kospi_below_ma20: "technical",
  kospi_below_ma60: "technical",
  cma_below_20d_average: "cma"
};

export const CATEGORY_CAPS = {
  liquidity: 25,
  leverage: 25,
  flow: 25,
  technical: 20,
  cma: 10
} as const;

export const SCORE_RULES_FOR_REPORT = [
  "deposit_drawdown_60d: investor deposits down at least 10% from the recent 60-trading-day high; adds 15 to liquidity risk.",
  "liquidity_quality_credit_to_deposit_high: credit loan / investor deposit ratio at least 25%; adds 10 or 12 to liquidity-quality risk.",
  "credit_to_deposit_ratio_high: credit loan / investor deposit ratio at least 25%; adds 5 or 8 to leverage risk.",
  "credit_loan_near_60d_high: credit loan at least 95% of the 60-trading-day high; adds 5 to leverage risk.",
  "credit_loan_20d_rise: credit loan up at least 3% over 20 trading days; adds 5 to leverage risk.",
  "credit_loan_acceleration_near_high: credit loan at least 98% of the 60-day high and up at least 5% over 20 trading days; adds 10 to leverage risk.",
  "foreigner_net_sell_5d: foreign investors net sold KOSPI for 5 consecutive trading days; adds 12 to flow risk.",
  "foreigner_sell_credit_high_divergence: foreign investors net sold KOSPI for 3 consecutive days while credit loan is at least 97% of its 60-day high; adds 13 to flow risk.",
  "Category caps apply: liquidityScore max 25, leverageScore max 25, flowScore max 25. Individual signal deltas may exceed the final category score because of caps."
];

function getSignalCode(signal: SignalEvent) {
  return signal.signalCode ?? signal.signalType;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findReason(signals: SignalEvent[], code: string) {
  return signals.find((signal) => getSignalCode(signal) === code)?.triggerReason ?? null;
}

function buildGroupSummary(groupId: SignalGroupId, signals: SignalEvent[]): SignalGroupSummary {
  const codes = unique(signals.map(getSignalCode));
  const score = signals.reduce((sum, signal) => sum + (Number.isFinite(signal.triggerScore) ? signal.triggerScore : 0), 0);
  const details = unique(signals.map((signal) => signal.triggerReason));

  let summary = details[0] ?? "신호 세부 내용이 없습니다.";

  if (groupId === "liquidity") {
    const deposit = findReason(signals, "deposit_drawdown_60d");
    const quality = findReason(signals, "liquidity_quality_credit_to_deposit_high") ?? findReason(signals, "credit_to_deposit_ratio_high");
    if (deposit && quality) summary = `${deposit} 동시에 ${quality}`;
    else if (deposit) summary = `${deposit} 예탁금 감소는 대기 매수 자금과 현금 완충력 약화를 의미합니다.`;
    else if (quality) summary = `${quality} 예탁금 자체보다 신용 부담이 더 빠르게 커진 질적 유동성 악화 신호입니다.`;
  }

  if (groupId === "leverage") {
    const nearHigh = findReason(signals, "credit_loan_near_60d_high");
    const rise20 = findReason(signals, "credit_loan_20d_rise");
    const acceleration = findReason(signals, "credit_loan_acceleration_near_high");
    const totalCredit = findReason(signals, "total_credit_near_60d_high");
    summary = [nearHigh, rise20, acceleration, totalCredit]
      .filter(Boolean)
      .join(" ");
    if (!summary) summary = details.join(" ");
  }

  if (groupId === "flow") {
    const foreign5 = findReason(signals, "foreigner_net_sell_5d");
    const divergence = findReason(signals, "foreigner_sell_credit_high_divergence");
    const both = findReason(signals, "foreigner_institution_net_sell");
    summary = [foreign5, divergence, both].filter(Boolean).join(" ");
    if (!summary) summary = details.join(" ");
  }

  if (groupId === "technical") {
    summary = details.join(" ");
  }

  return {
    id: groupId,
    title: GROUP_LABELS[groupId],
    score,
    signalCount: signals.length,
    summary,
    details,
    signalCodes: codes
  };
}

export function summarizeSignalGroups(signals: SignalEvent[]): SignalGroupSummary[] {
  const grouped = new Map<SignalGroupId, SignalEvent[]>();

  for (const signal of signals) {
    const code = getSignalCode(signal);
    const groupId = CODE_TO_GROUP[code] ?? "other";
    grouped.set(groupId, [...(grouped.get(groupId) ?? []), signal]);
  }

  const order: SignalGroupId[] = ["liquidity", "leverage", "flow", "technical", "cma", "other"];
  return order
    .map((groupId) => {
      const groupSignals = grouped.get(groupId) ?? [];
      return groupSignals.length > 0 ? buildGroupSummary(groupId, groupSignals) : null;
    })
    .filter((group): group is SignalGroupSummary => group !== null);
}

export function buildConditionStatus(signals: SignalEvent[]) {
  const codes = new Set(signals.map(getSignalCode));
  return [
    {
      code: "deposit_drawdown_60d",
      label: "예탁금 60일 고점 대비 10% 이상 감소",
      triggered: codes.has("deposit_drawdown_60d")
    },
    {
      code: "liquidity_quality_credit_to_deposit_high",
      label: "신용융자/예탁금 비율 25% 이상",
      triggered: codes.has("liquidity_quality_credit_to_deposit_high") || codes.has("credit_to_deposit_ratio_high")
    },
    {
      code: "credit_loan_near_60d_high",
      label: "신용융자 60일 고점권",
      triggered: codes.has("credit_loan_near_60d_high")
    },
    {
      code: "credit_loan_20d_rise",
      label: "신용융자 20거래일 증가",
      triggered: codes.has("credit_loan_20d_rise")
    },
    {
      code: "credit_loan_acceleration_near_high",
      label: "신용융자 고점권 + 20거래일 급증",
      triggered: codes.has("credit_loan_acceleration_near_high")
    },
    {
      code: "foreigner_net_sell_5d",
      label: "외국인 5거래일 연속 순매도",
      triggered: codes.has("foreigner_net_sell_5d")
    },
    {
      code: "foreigner_sell_credit_high_divergence",
      label: "외국인 순매도 + 신용융자 고점권 괴리",
      triggered: codes.has("foreigner_sell_credit_high_divergence")
    }
  ];
}

export function buildRawScoreBreakdown(signals: SignalEvent[]): RawScoreBreakdown {
  const result: RawScoreBreakdown = {
    liquidity: 0,
    leverage: 0,
    flow: 0,
    technical: 0,
    cma: 0,
    other: 0
  };

  for (const signal of signals) {
    const code = getSignalCode(signal);
    const category = CODE_TO_SCORE_CATEGORY[code] ?? "other";
    result[category] += Number.isFinite(signal.triggerScore) ? signal.triggerScore : 0;
  }

  return result;
}
