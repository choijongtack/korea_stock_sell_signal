"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

type RiskPoint = {
  tradeDate: string;
  totalScore: number;
  kospiReturn20d?: number | null;
  kospiForwardReturn5d?: number | null;
  kospiForwardReturn20d?: number | null;
  components?: Record<string, number>;
};

interface RiskNormalizedCompareChartProps {
  riskSeries: RiskPoint[];
  indexSeries: Array<{ tradeDate: string; kospi: number | null; kosdaq: number | null; kospi200: number | null }>;
}

type CompareMode = "state" | "normalized" | "raw";

const formatDateTick = (value: number | string): string => String(value).slice(5);

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

function normalizeByFirst(values: Array<number | null>): Array<number | null> {
  const base = values.find((v) => typeof v === "number" && Number.isFinite(v) && v > 0) ?? null;
  if (base === null) return values.map(() => null);
  return values.map((v) => (typeof v === "number" && Number.isFinite(v) ? Number(((v / base) * 100).toFixed(2)) : null));
}

function fmt(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function topComponents(components?: Record<string, number>) {
  return Object.entries(components ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([key, value]) => ({ label: featureLabels[key] ?? key, value }));
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const components = topComponents(row?.components);

  return (
    <div className="max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <div className="font-semibold text-slate-950">{label}</div>
      <div className="mt-2 space-y-1">
        {payload
          .filter((item) => item.value !== null && item.value !== undefined)
          .map((item) => (
            <div key={`${item.name}-${item.dataKey}`} className="flex items-center justify-between gap-4">
              <span style={{ color: item.color }}>{item.name}</span>
              <span className="font-semibold text-slate-800">{fmt(item.value)}</span>
            </div>
          ))}
      </div>
      <div className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
        <div>KOSPI 20일 수익률: <span className="font-semibold">{fmt(row?.kospiReturn20d)}%</span></div>
        <div>향후 5일: <span className="font-semibold">{fmt(row?.kospiForwardReturn5d)}%</span></div>
        <div>향후 20일: <span className="font-semibold">{fmt(row?.kospiForwardReturn20d)}%</span></div>
      </div>
      {components.length > 0 ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="font-semibold text-slate-700">주요 기여 지표</div>
          <div className="mt-1 space-y-1">
            {components.map((item) => (
              <div key={item.label} className="flex justify-between gap-3 text-slate-600">
                <span>{item.label}</span>
                <span className="font-semibold">{fmt(item.value, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RiskNormalizedCompareChart({ riskSeries, indexSeries }: RiskNormalizedCompareChartProps) {
  const [mode, setMode] = useState<CompareMode>("state");
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!mounted || !chartRef.current) return;

    const updateChartSize = () => {
      const rect = chartRef.current?.getBoundingClientRect();
      setChartSize({
        width: rect && rect.width > 0 ? Math.floor(rect.width) : 0,
        height: rect && rect.height > 0 ? Math.floor(rect.height) : 0
      });
    };

    updateChartSize();
    const observer = new ResizeObserver(updateChartSize);
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [mounted]);

  const chartData = useMemo(() => {
    const riskMap = new Map(riskSeries.map((r) => [r.tradeDate, r]));
    const rows = indexSeries
      .map((idx) => {
        const risk = riskMap.get(idx.tradeDate);
        return {
          tradeDate: idx.tradeDate,
          score: risk?.totalScore ?? null,
          kospi: idx.kospi,
          kospiReturn20d: risk?.kospiReturn20d ?? null,
          kospiForwardReturn5d: risk?.kospiForwardReturn5d ?? null,
          kospiForwardReturn20d: risk?.kospiForwardReturn20d ?? null,
          components: risk?.components ?? {}
        };
      })
      .filter((row) => row.score !== null || row.kospi !== null)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    const scoreNorm = normalizeByFirst(rows.map((r) => r.score));
    const kospiNorm = normalizeByFirst(rows.map((r) => r.kospi));
    return rows.map((row, i) => ({
      ...row,
      scoreNorm: scoreNorm[i],
      kospiNorm: kospiNorm[i],
      scoreRaw: row.score,
      kospiRaw: row.kospi
    }));
  }, [indexSeries, riskSeries]);

  const crisisRanges = useMemo(() => {
    const ranges: Array<{ start: string; end: string }> = [];
    let start: string | null = null;
    let end: string | null = null;
    for (const row of chartData) {
      if ((row.scoreRaw ?? 0) >= 90) {
        start ??= row.tradeDate;
        end = row.tradeDate;
      } else if (start && end) {
        ranges.push({ start, end });
        start = null;
        end = null;
      }
    }
    if (start && end) ranges.push({ start, end });
    return ranges;
  }, [chartData]);

  const brushStartIndex = Math.max(0, chartData.length - 120);
  const brushEndIndex = Math.max(0, chartData.length - 1);
  const subtitle =
    mode === "state"
      ? "위험점수와 KOSPI 20일 수익률을 함께 봅니다. 점수는 높고 20일 수익률은 낮을수록 약세 상태입니다."
      : mode === "normalized"
        ? "기준일을 100으로 맞춰 위험점수와 KOSPI의 상대 추이를 비교합니다."
        : "위험점수와 KOSPI 원 지표를 각각의 축으로 비교합니다.";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">KOSPI 위험 상태 비교</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          {[
            ["state", "상태 비교"],
            ["normalized", "상대 추이"],
            ["raw", "원 지표"]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value as CompareMode)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {mode === "state" ? (
          <>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">검정: 위험점수</span>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-blue-700 ring-1 ring-blue-200">파랑: KOSPI 20일 수익률</span>
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 font-semibold text-red-700 ring-1 ring-red-200">붉은 배경: 90점 이상</span>
          </>
        ) : mode === "normalized" ? (
          <>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">기준일 100</span>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">검정: 위험점수</span>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-blue-700 ring-1 ring-blue-200">파랑: KOSPI</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">왼쪽 축: 위험점수</span>
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-blue-700 ring-1 ring-blue-200">오른쪽 축: KOSPI</span>
          </>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-800">
          해석 기준: 위험지수는 KOSPI와 같은 방향이 아니라, 보통 역방향 관계로 봅니다.
        </p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
          <div className="rounded-md bg-white p-2 ring-1 ring-slate-200">
            <span className="font-semibold text-slate-900">KOSPI 하락 + 위험지수 상승</span>
            <span className="mt-1 block">모델이 약세 상태를 잘 감지한 구간입니다.</span>
          </div>
          <div className="rounded-md bg-white p-2 ring-1 ring-slate-200">
            <span className="font-semibold text-slate-900">KOSPI 상승 + 위험지수 하락</span>
            <span className="mt-1 block">정상적인 안정 또는 회복 구간으로 봅니다.</span>
          </div>
          <div className="rounded-md bg-white p-2 ring-1 ring-slate-200">
            <span className="font-semibold text-slate-900">KOSPI 상승 + 위험지수 상승</span>
            <span className="mt-1 block">상승 중 수급 스트레스나 과열 경계가 커진 상태입니다.</span>
          </div>
          <div className="rounded-md bg-white p-2 ring-1 ring-slate-200">
            <span className="font-semibold text-slate-900">KOSPI 하락 + 위험지수 하락</span>
            <span className="mt-1 block">지수 하락이 아직 모델상 강한 위험 상태로 잡히지 않은 구간입니다.</span>
          </div>
        </div>
      </div>

      <div ref={chartRef} className="mt-4 h-72 min-w-0 sm:h-80 md:h-96">
        {mounted && chartSize.width > 0 && chartSize.height > 0 ? (
          chartData.length > 0 ? (
            <LineChart
              data={chartData}
              width={chartSize.width}
              height={chartSize.height}
              margin={{ top: 10, right: isMobile ? 8 : 20, left: isMobile ? 0 : 8, bottom: 0 }}
            >
              <XAxis dataKey="tradeDate" tick={{ fontSize: isMobile ? 10 : 12 }} tickFormatter={formatDateTick} minTickGap={isMobile ? 20 : 14} />
              {mode === "normalized" ? (
                <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : 50} domain={["auto", "auto"]} />
              ) : (
                <>
                  <YAxis yAxisId="left" tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : 50} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 56 : 64} domain={["auto", "auto"]} />
                </>
              )}
              <Tooltip content={<CustomTooltip />} />

              {mode === "state"
                ? crisisRanges.map((range) => (
                    <ReferenceArea key={`${range.start}-${range.end}`} x1={range.start} x2={range.end} yAxisId="left" fill="#fee2e2" fillOpacity={0.45} />
                  ))
                : null}

              {mode === "state" ? (
                <>
                  <ReferenceLine yAxisId="left" y={75} stroke="#f97316" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="left" y={90} stroke="#ef4444" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Line yAxisId="left" type="monotone" dataKey="scoreRaw" name="Risk Score" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="kospiReturn20d" name="KOSPI 20D return (%)" stroke="#2563eb" strokeWidth={2} dot={false} />
                </>
              ) : mode === "normalized" ? (
                <>
                  <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="scoreNorm" name="Risk Score (norm)" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="kospiNorm" name="KOSPI (norm)" stroke="#2563eb" strokeWidth={2} dot={false} />
                </>
              ) : (
                <>
                  <ReferenceLine yAxisId="left" y={75} stroke="#f97316" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="left" y={90} stroke="#ef4444" strokeDasharray="3 3" />
                  <Line yAxisId="left" type="monotone" dataKey="scoreRaw" name="Risk Score" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="kospiRaw" name="KOSPI" stroke="#2563eb" strokeWidth={2} dot={false} />
                </>
              )}

              <Brush
                dataKey="tradeDate"
                height={30}
                stroke="#cbd5e1"
                fill="#f8fafc"
                tickFormatter={() => ""}
                startIndex={brushStartIndex}
                endIndex={brushEndIndex}
              />
            </LineChart>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
              No overlapping score/index history.
            </div>
          )
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
    </section>
  );
}
