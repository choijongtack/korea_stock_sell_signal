"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

export function LiquidityChart({ data }: LiquidityChartProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("liquidity");

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const chartData = useMemo(() => data[activeCategory], [activeCategory, data]);
  const activeMeta = categoryMeta[activeCategory];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">시장 핵심 지표 추이</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(categoryMeta) as CategoryKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveCategory(key)}
            className={`rounded-md px-3 py-1.5 text-xs ${activeCategory === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {categoryMeta[key].label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        <p className="mb-2 font-semibold">서브 지표 인덱스</p>
        <div className="flex flex-wrap gap-2">
          {activeMeta.lines.map((line) => (
            <span key={line.key} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64 w-full sm:h-72 md:h-80">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData as any[]} margin={{ top: 10, right: isMobile ? 8 : 24, left: isMobile ? 4 : 12, bottom: 0 }}>
              <XAxis dataKey="tradeDate" tick={{ fontSize: isMobile ? 10 : 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              {!isMobile ? <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} /> : null}
              <Tooltip />
              {activeMeta.lines.map((line) => (
                <Line
                  key={line.key}
                  yAxisId={activeMeta.yAxisId}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  name={line.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
    </section>
  );
}
