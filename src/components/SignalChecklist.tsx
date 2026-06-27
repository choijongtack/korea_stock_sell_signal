import { AlertCircle, CheckCircle2, ListChecks, ShieldCheck } from "lucide-react";
import { summarizeSignalGroups } from "@/lib/signalAnalysis";
import type { RiskLevel, SignalEvent } from "@/types/market";

interface SignalChecklistProps {
  signals?: SignalEvent[];
  riskState?: {
    tradeDate?: string | null;
    totalScore: number;
    riskLevel: RiskLevel;
    components?: Record<string, number>;
  };
}

const featureLabels: Record<string, string> = {
  kospi_foreign_20d: "KOSPI 외국인 20일 누적",
  deposit_to_total_cap: "예탁금/시총 비율",
  kospi_foreign_5d: "KOSPI 외국인 5일 누적",
  investor_deposit_pct20d: "투자자예탁금 20일 변화",
  rp_balance_pct20d: "RP 잔고 20일 변화",
  kosdaq_foreign_20d: "KOSDAQ 외국인 20일 누적",
  kospi_individual_20d: "KOSPI 개인 20일 누적",
  kospi_institution_5d: "KOSPI 기관 5일 누적",
  kosdaq_institution_20d: "KOSDAQ 기관 20일 누적",
  derivatives_deposit_pct20d: "파생상품 예수금 20일 변화",
  kospiForeign20d: "KOSPI 외국인 20일 누적",
  depositToTotalCap: "예탁금/시총 비율",
  kospiForeign5d: "KOSPI 외국인 5일 누적",
  investorDepositPct20d: "투자자예탁금 20일 변화",
  rpBalancePct20d: "RP 잔고 20일 변화",
  kosdaqForeign20d: "KOSDAQ 외국인 20일 누적",
  kospiIndividual20d: "KOSPI 개인 20일 누적",
  kospiInstitution5d: "KOSPI 기관 5일 누적",
  kosdaqInstitution20d: "KOSDAQ 기관 20일 누적",
  derivativesDepositPct20d: "파생상품 예수금 20일 변화"
};

const featureDescriptions: Record<string, { riskUp: string; riskDown: string }> = {
  kospi_foreign_20d: {
    riskUp: "최근 20거래일 외국인 수급이 KOSPI 약세 상태와 같은 방향으로 움직여 위험 점수를 올렸습니다.",
    riskDown: "최근 20거래일 외국인 수급이 KOSPI 약세 상태를 완화하는 방향으로 움직였습니다."
  },
  kospi_foreign_5d: {
    riskUp: "최근 5거래일 외국인 수급이 단기 스트레스를 키우는 방향으로 반영됐습니다.",
    riskDown: "최근 5거래일 외국인 수급이 단기 스트레스를 낮추는 방향으로 반영됐습니다."
  },
  kosdaq_foreign_20d: {
    riskUp: "KOSDAQ 외국인 수급이 시장 전반의 위험을 키우는 쪽으로 반영됐습니다.",
    riskDown: "KOSDAQ 외국인 수급은 이번 점수에서 위험을 일부 낮추는 쪽으로 작용했습니다."
  },
  kospi_individual_20d: {
    riskUp: "최근 20거래일 개인 수급 패턴이 과거 KOSPI 약세 구간과 가까워 위험 점수를 올렸습니다.",
    riskDown: "최근 20거래일 개인 수급 패턴이 과거 약세 구간과는 덜 비슷해 위험을 낮췄습니다."
  },
  kospi_institution_5d: {
    riskUp: "최근 5거래일 기관 수급이 단기 위험을 키우는 방향으로 반영됐습니다.",
    riskDown: "최근 5거래일 기관 수급은 단기 위험을 일부 완화하는 쪽으로 작용했습니다."
  },
  kosdaq_institution_20d: {
    riskUp: "KOSDAQ 기관 수급이 시장 내부 스트레스를 키우는 방향으로 반영됐습니다.",
    riskDown: "KOSDAQ 기관 수급은 시장 내부 스트레스를 낮추는 방향으로 반영됐습니다."
  },
  deposit_to_total_cap: {
    riskUp: "예탁금이 전체 시가총액 대비 높은 상태로, 과거 약세 상태와 연결되어 위험 점수를 올렸습니다.",
    riskDown: "예탁금/시총 비율은 이번 점수에서 과거 약세 상태와 덜 가까운 방향입니다."
  },
  investor_deposit_pct20d: {
    riskUp: "투자자예탁금의 20일 변화가 과거 위험 구간과 가까워 점수를 올렸습니다.",
    riskDown: "투자자예탁금의 20일 변화는 위험을 일부 낮추는 쪽으로 반영됐습니다."
  },
  rp_balance_pct20d: {
    riskUp: "RP 잔고의 20일 변화가 유동성 스트레스 신호로 반영됐습니다.",
    riskDown: "RP 잔고의 20일 변화는 유동성 스트레스를 완화하는 쪽으로 반영됐습니다."
  },
  derivatives_deposit_pct20d: {
    riskUp: "파생상품 예수금 변화가 위험 선호 또는 헤지 수요 변화로 반영되어 점수를 올렸습니다.",
    riskDown: "파생상품 예수금 변화는 이번 점수에서 위험을 낮추는 쪽으로 작용했습니다."
  }
};

function getFeatureDescription(key: string, value: number) {
  const normalizedKey = key
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
  const description = featureDescriptions[key] ?? featureDescriptions[normalizedKey];
  if (!description) {
    return value >= 0
      ? "과거 KOSPI 약세 상태와 가까운 패턴으로 반영되어 위험 점수를 올렸습니다."
      : "이번 점수에서는 과거 약세 상태와 덜 가까운 패턴으로 반영되어 위험을 낮췄습니다.";
  }
  return value >= 0 ? description.riskUp : description.riskDown;
}

const levelLabel: Record<RiskLevel, string> = {
  stable: "안정",
  caution: "주의",
  warning: "경고",
  danger: "위험",
  crisis: "위기"
};

function formatContribution(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function buildComponentRows(components?: Record<string, number>) {
  return Object.entries(components ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([key, value]) => ({
      key,
      label: featureLabels[key] ?? key,
      value,
      description: getFeatureDescription(key, value),
      direction: value >= 0 ? "risk_up" : "risk_down"
    }));
}

export function SignalChecklist({ signals = [], riskState }: SignalChecklistProps) {
  if (riskState) {
    const rows = buildComponentRows(riskState.components);
    const riskUpRows = rows.filter((row) => row.value > 0);
    const riskDownRows = rows.filter((row) => row.value < 0);

    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">위험 기여 요인 분석</h2>
              <p className="text-xs text-slate-500">
                {riskState.tradeDate
                  ? `${riskState.tradeDate} 기준 ${levelLabel[riskState.riskLevel]} 단계, 구성 요인 ${rows.length}개`
                  : `구성 요인 ${rows.length}개`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">위험 점수 {Math.round(riskState.totalScore)}점</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                이 영역은 현재 위험 점수가 왜 높거나 낮아졌는지 보여줍니다. 각 숫자는 지수 자체가 아니라 모델 내부 기여도이며, 양수는 위험 상승, 음수는 위험 완화 방향입니다.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              현재 저장된 구성 요인이 없습니다.
            </div>
          ) : (
            <>
              {riskUpRows.length > 0 ? (
                <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
                  <p className="text-sm font-semibold text-rose-800">위험 상승 기여</p>
                  <div className="mt-2 space-y-2">
                    {riskUpRows.slice(0, 5).map((row) => (
                      <div key={row.key} className="rounded-md bg-white/70 p-2 text-sm ring-1 ring-rose-100">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-slate-900">{row.label}</span>
                          <span className="font-semibold text-rose-700">{formatContribution(row.value)}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{row.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {riskDownRows.length > 0 ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800">위험 완화 기여</p>
                  <div className="mt-2 space-y-2">
                    {riskDownRows.slice(0, 5).map((row) => (
                      <div key={row.key} className="rounded-md bg-white/70 p-2 text-sm ring-1 ring-emerald-100">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-slate-900">{row.label}</span>
                          <span className="font-semibold text-emerald-700">{formatContribution(row.value)}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{row.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    );
  }

  const groups = summarizeSignalGroups(signals);
  const latestDate = signals[0]?.tradeDate ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-100">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">발생 신호 분석</h2>
          <p className="text-xs text-slate-500">{latestDate ? `${latestDate} 기준 ${groups.length}개 영역, 원 신호 ${signals.length}건` : "최근 발생 신호 없음"}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">현재 발생한 신호가 없습니다.</div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      원 신호 {group.signalCount}건
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{group.summary}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
