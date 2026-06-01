"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { RiskLevel } from "@/types/market";

interface RiskScoreTrendChartProps {
  data: Array<{ tradeDate: string; totalScore: number; riskLevel: RiskLevel }>;
}

const levelColor: Record<RiskLevel, string> = {
  stable: "#10b981",
  caution: "#84cc16",
  warning: "#f59e0b",
  danger: "#f97316",
  crisis: "#ef4444"
};

const formatDateTick = (value: number | string): string => String(value).slice(5);

export function RiskScoreTrendChart({ data }: RiskScoreTrendChartProps) {
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

  const latest = useMemo(() => data.at(-1) ?? null, [data]);
  const brushStartIndex = Math.max(0, data.length - 120);
  const brushEndIndex = Math.max(0, data.length - 1);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Risk Score Trend</h2>
          <p className="text-xs text-slate-500">Market risk daily trend (0 to 100)</p>
        </div>
        {latest ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Latest: {latest.tradeDate} / {latest.totalScore}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">0-19 안정</span>
        <span className="inline-flex items-center rounded-full bg-lime-50 px-2.5 py-1 text-[11px] font-semibold text-lime-700 ring-1 ring-lime-200">20-39 주의</span>
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">40-59 경고</span>
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">60-84 위험</span>
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">85-100 위기</span>
      </div>

      <div ref={chartRef} className="mt-4 h-64 min-w-0 sm:h-72 md:h-80">
        {mounted && chartSize.width > 0 && chartSize.height > 0 ? (
          data.length > 0 ? (
            <LineChart
              data={data}
              width={chartSize.width}
              height={chartSize.height}
              margin={{ top: 10, right: isMobile ? 8 : 20, left: isMobile ? 0 : 8, bottom: 0 }}
            >
              <XAxis dataKey="tradeDate" tick={{ fontSize: isMobile ? 10 : 12 }} tickFormatter={formatDateTick} minTickGap={isMobile ? 20 : 14} />
              <YAxis domain={[0, 100]} tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 36 : 42} />
              <Tooltip
                contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [`${value ?? "-"}`, "Risk score"]}
              />
              <ReferenceLine y={20} stroke="#84cc16" strokeDasharray="3 3" />
              <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="3 3" />
              <ReferenceLine y={60} stroke="#f97316" strokeDasharray="3 3" />
              <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="totalScore" stroke="#0f172a" strokeWidth={2} dot={false} />
              <Line
                type="linear"
                dataKey="totalScore"
                stroke="transparent"
                dot={({ cx, cy, index }) => {
                  if (!Number.isFinite(cx) || !Number.isFinite(cy) || index == null) return null;
                  const row = data[index];
                  return <circle cx={cx} cy={cy} r={2.75} fill={levelColor[row.riskLevel] ?? "#64748b"} />;
                }}
                isAnimationActive={false}
              />
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
              No risk score history yet.
            </div>
          )
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
    </section>
  );
}
