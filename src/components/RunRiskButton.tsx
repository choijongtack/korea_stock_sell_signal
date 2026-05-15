"use client";

import { useState } from "react";

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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "실행 중..." : "위험 점수 계산 실행"}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
