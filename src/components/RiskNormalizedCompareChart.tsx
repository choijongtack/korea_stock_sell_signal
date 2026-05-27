"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

interface RiskNormalizedCompareChartProps {
  riskSeries: Array<{ tradeDate: string; totalScore: number }>;
  indexSeries: Array<{ tradeDate: string; kospi: number | null; kosdaq: number | null; kospi200: number | null }>;
}

type CompareMode = "raw" | "normalized";

const formatDateTick = (value: number | string): string => String(value).slice(5);

function normalizeByFirst(values: Array<number | null>): Array<number | null> {
  const base = values.find((v) => typeof v === "number" && Number.isFinite(v) && v > 0) ?? null;
  if (base === null) return values.map(() => null);
  return values.map((v) => (typeof v === "number" && Number.isFinite(v) ? Number(((v / base) * 100).toFixed(2)) : null));
}

export function RiskNormalizedCompareChart({ riskSeries, indexSeries }: RiskNormalizedCompareChartProps) {
  const [mode, setMode] = useState<CompareMode>("normalized");
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
    const riskMap = new Map(riskSeries.map((r) => [r.tradeDate, r.totalScore]));
    const rows = indexSeries
      .map((idx) => ({
        tradeDate: idx.tradeDate,
        score: riskMap.get(idx.tradeDate) ?? null,
        kospi: idx.kospi,
        kosdaq: idx.kosdaq,
        kospi200: idx.kospi200
      }))
      .filter((row) => row.score !== null || row.kospi !== null || row.kosdaq !== null || row.kospi200 !== null)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    const scoreNorm = normalizeByFirst(rows.map((r) => r.score));
    const kospiNorm = normalizeByFirst(rows.map((r) => r.kospi));
    return rows.map((row, i) => ({
      tradeDate: row.tradeDate,
      scoreNorm: scoreNorm[i],
      kospiNorm: kospiNorm[i],
      scoreRaw: row.score,
      kospiRaw: row.kospi
    }));
  }, [indexSeries, riskSeries]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Normalized Score vs Index</h2>
          <p className="text-xs text-slate-500">Base day = 100 (relative change)</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "raw" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Score vs KOSPI
          </button>
          <button
            type="button"
            onClick={() => setMode("normalized")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "normalized" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            상대 추이 비교
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {mode === "normalized" ? <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">기준일 100</span> : null}
        <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
          {mode === "normalized" ? "Risk Score (norm): #111827" : "Risk Score: #111827"}
        </span>
        <span className="inline-flex items-center rounded-full bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
          {mode === "normalized" ? "KOSPI (norm): #2563eb" : "KOSPI: #2563eb"}
        </span>
      </div>

      <div ref={chartRef} className="mt-4 h-64 min-w-0 sm:h-72 md:h-80">
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
              <Tooltip
                contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                formatter={(value, name) => [`${value ?? "-"}`, String(name)]}
              />
              {mode === "normalized" ? <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" /> : null}
              {mode === "normalized" ? (
                <>
                  <Line type="monotone" dataKey="scoreNorm" name="Risk Score (norm)" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="kospiNorm" name="KOSPI (norm)" stroke="#2563eb" strokeWidth={2} dot={false} />
                </>
              ) : (
                <>
                  <Line yAxisId="left" type="monotone" dataKey="scoreRaw" name="Risk Score" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="kospiRaw" name="KOSPI" stroke="#2563eb" strokeWidth={2} dot={false} />
                </>
              )}
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

