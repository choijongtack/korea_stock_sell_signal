"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type RunRiskResponse = {
  ok: boolean;
  calculatedRiskCount?: number;
  calculatedSignalCount?: number;
  saved?: {
    riskCount: number;
    signalCount: number;
  };
  error?: string;
};

export function RunRiskButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onRun = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/run-risk", { method: "POST" });
      const data = (await res.json()) as RunRiskResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "위험 점수 계산 실행 실패");
      }
      setMessage(`완료: risk ${data.calculatedRiskCount ?? 0}건, signal ${data.calculatedSignalCount ?? 0}건`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessage(`오류: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "실행 중..." : "위험 점수 계산 실행"}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
