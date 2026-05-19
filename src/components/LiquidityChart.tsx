"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, Tooltip, XAxis, YAxis, Brush } from "recharts";
import { AreaChart } from "lucide-react";

type CategoryKey = "liquidity" | "credit" | "cma" | "index" | "flow";

interface LiquidityChartProps {
  data: {
    liquidity: Array<{
      tradeDate: string;
      investorDepositMillionKrw: number | null;
      derivativesDepositMillionKrw: number | null;
      rpBalanceMillionKrw: number | null;
      unsettledBalanceMillionKrw: number | null;
    }>;
    credit: Array<{
      tradeDate: string;
      creditLoanMillionKrw: number | null;
      creditShortMillionKrw: number | null;
      collateralLoanMillionKrw: number | null;
      totalCreditMillionKrw: number | null;
    }>;
    cma: Array<{
      tradeDate: string;
      totalMillionKrw: number | null;
      rpTypeMillionKrw: number | null;
      mmfTypeMillionKrw: number | null;
      jonggeumTypeMillionKrw: number | null;
      issuingNoteTypeMillionKrw: number | null;
      otherTypeMillionKrw: number | null;
    }>;
    index: Array<{
      tradeDate: string;
      kospi: number | null;
      kosdaq: number | null;
      kospi200: number | null;
    }>;
    flow: Array<{
      tradeDate: string;
      foreignNetBuy: number;
      institutionNetBuy: number;
      individualNetBuy: number;
      programNetBuy: number;
    }>;
  };
}

const categoryMeta: Record<CategoryKey, { label: string; yAxisId: "left" | "right"; lines: Array<{ key: string; label: string; color: string }> }> = {
  liquidity: {
    label: "유동성",
    yAxisId: "left",
    lines: [
      { key: "investorDepositMillionKrw", label: "투자자예탁금", color: "#2563eb" },
      { key: "derivativesDepositMillionKrw", label: "파생예탁금", color: "#7c3aed" },
      { key: "rpBalanceMillionKrw", label: "RP잔고", color: "#f59e0b" },
      { key: "unsettledBalanceMillionKrw", label: "미수금", color: "#ef4444" }
    ]
  },
  credit: {
    label: "신용잔고",
    yAxisId: "left",
    lines: [
      { key: "creditLoanMillionKrw", label: "신용융자", color: "#dc2626" },
      { key: "creditShortMillionKrw", label: "신용대주", color: "#f97316" },
      { key: "collateralLoanMillionKrw", label: "예탁담보융자", color: "#a855f7" },
      { key: "totalCreditMillionKrw", label: "총신용", color: "#111827" }
    ]
  },
  cma: {
    label: "CMA",
    yAxisId: "left",
    lines: [
      { key: "totalMillionKrw", label: "CMA합계", color: "#334155" },
      { key: "rpTypeMillionKrw", label: "RP형", color: "#2563eb" },
      { key: "mmfTypeMillionKrw", label: "MMF형", color: "#0d9488" },
      { key: "jonggeumTypeMillionKrw", label: "종금형", color: "#7c3aed" },
      { key: "issuingNoteTypeMillionKrw", label: "발행어음형", color: "#ea580c" },
      { key: "otherTypeMillionKrw", label: "기타", color: "#64748b" }
    ]
  },
  index: {
    label: "지수",
    yAxisId: "right",
    lines: [
      { key: "kospi", label: "KOSPI", color: "#16a34a" },
      { key: "kosdaq", label: "KOSDAQ", color: "#2563eb" },
      { key: "kospi200", label: "KOSPI200", color: "#f59e0b" }
    ]
  },
  flow: {
    label: "투자자 수급",
    yAxisId: "left",
    lines: [
      { key: "foreignNetBuy", label: "외국인 순매수", color: "#2563eb" },
      { key: "institutionNetBuy", label: "기관 순매수", color: "#16a34a" },
      { key: "individualNetBuy", label: "개인 순매수", color: "#ef4444" },
      { key: "programNetBuy", label: "프로그램 순매수", color: "#7c3aed" }
    ]
  }
};

const formatYAxisValue = (value: number | string, category: CategoryKey): string => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (category === "index") return `${Math.round(num).toLocaleString()} pt`;
  return `${Math.round(num).toLocaleString()} 백만`;
};

export function LiquidityChart({ data }: LiquidityChartProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("liquidity");
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

  const chartData = useMemo(() => data[activeCategory], [activeCategory, data]);
  const activeMeta = categoryMeta[activeCategory];
  const effectiveYAxisId = isMobile && activeCategory === "index" ? "left" : activeMeta.yAxisId;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <AreaChart className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">시장 핵심 지표 추이</h2>
            <p className="text-xs text-slate-500">{activeMeta.label} 기준 차트</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(categoryMeta) as CategoryKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveCategory(key)}
              className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${
                activeCategory === key ? "bg-slate-950 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              {categoryMeta[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="flex flex-wrap gap-1.5">
          {activeMeta.lines.map((line) => (
            <span key={line.key} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 font-medium ring-1 ring-slate-200">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      </div>

      <div ref={chartRef} className="mt-4 h-72 min-w-0 sm:h-80 md:h-96">
        {mounted && chartSize.width > 0 && chartSize.height > 0 ? (
            <LineChart
              data={chartData as any[]}
              width={chartSize.width}
              height={chartSize.height}
              margin={{ top: 10, right: isMobile ? 8 : 24, left: isMobile ? 4 : 12, bottom: 0 }}
            >
              <XAxis dataKey="tradeDate" tick={{ fontSize: isMobile ? 10 : 12 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: isMobile ? 10 : 12 }}
                width={isMobile ? 64 : 80}
                tickFormatter={(v) => formatYAxisValue(v, activeCategory)}
              />
              {!isMobile ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  width={80}
                  tickFormatter={(v) => formatYAxisValue(v, activeCategory)}
                />
              ) : null}
              <Tooltip
                contentStyle={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  boxShadow: "0 10px 25px rgb(15 23 42 / 0.08)",
                  fontSize: 12
                }}
              />
              {activeMeta.lines.map((line) => (
                <Line
                  key={line.key}
                  yAxisId={effectiveYAxisId}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  name={line.label}
                />
              ))}
              <Brush
                dataKey="tradeDate"
                height={30}
                stroke="#cbd5e1"
                fill="#f8fafc"
                tickFormatter={() => ""}
                startIndex={Math.max(0, chartData.length - 120)}
                endIndex={Math.max(0, chartData.length - 1)}
              />
            </LineChart>
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
    </section>
  );
}
