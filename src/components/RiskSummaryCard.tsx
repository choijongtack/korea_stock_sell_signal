import { AlertTriangle, Info } from "lucide-react";
import type { RiskLevel } from "@/types/market";

export const riskLevelLabel: Record<RiskLevel, string> = {
  stable: "안정",
  caution: "주의",
  warning: "경고",
  danger: "위험",
  crisis: "위기"
};

const riskLevelTone: Record<RiskLevel, { badge: string; bar: string; panel: string; item: string }> = {
  stable: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    bar: "bg-emerald-500",
    panel: "from-emerald-50 to-white",
    item: "border-emerald-100 bg-emerald-50"
  },
  caution: {
    badge: "bg-lime-50 text-lime-700 ring-lime-200",
    bar: "bg-lime-500",
    panel: "from-lime-50 to-white",
    item: "border-lime-100 bg-lime-50"
  },
  warning: {
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    bar: "bg-amber-500",
    panel: "from-amber-50 to-white",
    item: "border-amber-100 bg-amber-50"
  },
  danger: {
    badge: "bg-orange-50 text-orange-800 ring-orange-200",
    bar: "bg-orange-500",
    panel: "from-orange-50 to-white",
    item: "border-orange-100 bg-orange-50"
  },
  crisis: {
    badge: "bg-red-50 text-red-700 ring-red-200",
    bar: "bg-red-500",
    panel: "from-red-50 to-white",
    item: "border-red-100 bg-red-50"
  }
};

const featureLabels: Record<string, string> = {
  kospi_foreign_20d: "KOSPI 외국인 20일 수급",
  kospi_foreign_5d: "KOSPI 외국인 5일 수급",
  kosdaq_foreign_20d: "KOSDAQ 외국인 20일 수급",
  kospi_individual_20d: "KOSPI 개인 20일 수급",
  kospi_institution_5d: "KOSPI 기관 5일 수급",
  kosdaq_institution_20d: "KOSDAQ 기관 20일 수급",
  deposit_to_total_cap: "예탁금/시가총액 비율",
  investor_deposit_pct20d: "투자자예탁금 20일 변화",
  rp_balance_pct20d: "RP 잔고 20일 변화",
  derivatives_deposit_pct20d: "파생상품 예수금 20일 변화",
  kospiForeign20d: "KOSPI 외국인 20일 수급",
  kospiForeign5d: "KOSPI 외국인 5일 수급",
  kosdaqForeign20d: "KOSDAQ 외국인 20일 수급",
  kospiIndividual20d: "KOSPI 개인 20일 수급",
  kospiInstitution5d: "KOSPI 기관 5일 수급",
  kosdaqInstitution20d: "KOSDAQ 기관 20일 수급",
  depositToTotalCap: "예탁금/시가총액 비율",
  investorDepositPct20d: "투자자예탁금 20일 변화",
  rpBalancePct20d: "RP 잔고 20일 변화",
  derivativesDepositPct20d: "파생상품 예수금 20일 변화"
};

const featureReasons: Record<string, { up: string; down: string }> = {
  kospi_foreign_20d: {
    up: "최근 20거래일 외국인 수급이 과거 KOSPI 약세 구간과 비슷한 방향입니다.",
    down: "최근 20거래일 외국인 수급은 약세 위험을 일부 낮추는 방향입니다."
  },
  kospi_foreign_5d: {
    up: "최근 5거래일 외국인 수급이 단기 스트레스를 높이는 쪽으로 반영됐습니다.",
    down: "최근 5거래일 외국인 수급은 단기 스트레스를 낮추는 쪽으로 반영됐습니다."
  },
  kosdaq_foreign_20d: {
    up: "KOSDAQ 외국인 수급이 시장 전반의 위험을 키우는 쪽으로 반영됐습니다.",
    down: "KOSDAQ 외국인 수급은 이번 점수에서 위험을 일부 낮췄습니다."
  },
  kospi_individual_20d: {
    up: "개인 수급 패턴이 과거 약세 구간에서 자주 나타난 형태와 가깝습니다.",
    down: "개인 수급 패턴은 과거 약세 구간과 덜 비슷합니다."
  },
  kospi_institution_5d: {
    up: "기관 단기 수급이 위험을 키우는 방향으로 반영됐습니다.",
    down: "기관 단기 수급은 위험을 일부 완화하는 방향으로 반영됐습니다."
  },
  kosdaq_institution_20d: {
    up: "KOSDAQ 기관 수급이 내부 스트레스를 키우는 방향입니다.",
    down: "KOSDAQ 기관 수급은 내부 스트레스를 낮추는 방향입니다."
  },
  deposit_to_total_cap: {
    up: "예탁금이 시가총액 대비 높은 상태로, 과거 약세 상태와 연결돼 점수를 올렸습니다.",
    down: "예탁금/시가총액 비율은 이번 점수에서 위험을 낮추는 방향입니다."
  }
};

interface RiskSummaryCardProps {
  totalScore: number;
  riskLevel: RiskLevel;
  summary?: string | null;
  components?: Record<string, number>;
  showDetails?: boolean;
}

function normalizeKey(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function explainComponent(key: string, value: number) {
  const normalizedKey = normalizeKey(key);
  const reason = featureReasons[key] ?? featureReasons[normalizedKey];
  if (reason) return value >= 0 ? reason.up : reason.down;
  return value >= 0
    ? "과거 KOSPI 약세 상태와 가까운 패턴이라 위험 점수를 올렸습니다."
    : "과거 KOSPI 약세 상태와 덜 가까운 패턴이라 위험 점수를 낮췄습니다.";
}

function buildReasonRows(components?: Record<string, number>) {
  return Object.entries(components ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([key, value]) => ({
      key,
      label: featureLabels[key] ?? featureLabels[normalizeKey(key)] ?? key,
      value,
      reason: explainComponent(key, value)
    }));
}

function summarizeContributions(components?: Record<string, number>) {
  const values = Object.values(components ?? {}).filter((value) => Number.isFinite(value));
  const riskUp = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const riskDown = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return {
    riskUp,
    riskDown,
    net: riskUp + riskDown,
    count: values.length
  };
}

function formatContribution(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

export function RiskSummaryCard({ totalScore, riskLevel, summary, components, showDetails = false }: RiskSummaryCardProps) {
  const tone = riskLevelTone[riskLevel];
  const progress = Math.max(0, Math.min(100, totalScore));
  const reasonRows = buildReasonRows(components);
  const contributionSummary = summarizeContributions(components);

  return (
    <section className={`rounded-xl border border-slate-200 bg-gradient-to-br ${tone.panel} p-5 shadow-sm sm:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">KOSPI 위험 상태 지수</p>
            <p className="text-xs text-slate-500">현재 KOSPI 약세 상태와 동행하는 위험 점수</p>
          </div>
        </div>
        <details className="relative">
          <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900">
            <Info className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg">
            0~39 안정, 40~59 주의, 60~74 경고, 75~89 위험, 90~100 위기 기준입니다. 이 점수는 미래 예측이 아니라 현재 KOSPI 약세 상태와 동행하는 위험 상태 지수입니다.
          </div>
        </details>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <p className="text-6xl font-bold tracking-tight text-slate-950">{Math.round(totalScore)}</p>
          <p className="pb-2 text-lg font-semibold text-slate-600">/ 100</p>
        </div>
        <div className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${tone.badge}`}>
          {riskLevelLabel[riskLevel]} ({riskLevel})
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${progress}%` }} />
      </div>

      {summary && <p className="mt-4 text-sm leading-6 text-slate-700">{summary}</p>}

      {showDetails && reasonRows.length > 0 ? (
        <div className="mt-5 rounded-lg border border-white/80 bg-white/70 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">{Math.round(totalScore)}점 산출 방식</h3>
            <span className="text-xs text-slate-500">구성 요인 {contributionSummary.count}개 기준</span>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <div className="rounded-md border border-rose-100 bg-rose-50 p-3">
              <p className="text-xs font-semibold text-rose-700">위험 상승 기여</p>
              <p className="mt-1 text-lg font-bold text-rose-800">{formatContribution(contributionSummary.riskUp)}</p>
            </div>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-700">위험 완화 기여</p>
              <p className="mt-1 text-lg font-bold text-emerald-800">{formatContribution(contributionSummary.riskDown)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500">순 기여도</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{formatContribution(contributionSummary.net)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500">과거 분포 백분위</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{Math.round(totalScore)}번째 백분위</p>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
            산출 순서: 각 지표를 과거 평균과 변동성 기준으로 표준화합니다. 그 다음 KOSPI 20일 약세 상태와의 연관 방향과 강도를 가중치로 적용해 내부 위험값을 만듭니다.
            마지막으로 이 내부 위험값을 과거 학습구간의 분포와 비교해 백분위 점수로 변환합니다. 따라서 현재 {Math.round(totalScore)}점은 내부 위험값이 과거 기준일 중 약 {Math.round(totalScore)}%보다 높은 위치에 있다는 뜻입니다.
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-950">주요 구성 요인</h4>
            <span className="text-xs text-slate-500">절댓값이 큰 순서</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {reasonRows.map((row) => (
              <div key={row.key} className={`rounded-md border p-3 ${row.value >= 0 ? tone.item : "border-emerald-100 bg-emerald-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <span className={row.value >= 0 ? "text-sm font-semibold text-red-700" : "text-sm font-semibold text-emerald-700"}>
                    {formatContribution(row.value)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{row.reason}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            기여도 숫자는 원자료 값이 아니라 모델 내부 점수입니다. {Math.round(totalScore)}점은 기여도 합계를 직접 0~100으로 바꾼 값이 아니라, 내부 위험값을 과거 분포에서 백분위로 환산한 최종 점수입니다.
          </p>
        </div>
      ) : null}
    </section>
  );
}
