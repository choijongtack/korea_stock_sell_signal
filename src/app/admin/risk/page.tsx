"use client";

import { useState } from "react";

type RunRiskResponse = {
  ok: boolean;
  calculatedRiskCount?: number;
  calculatedSignalCount?: number;
  warning?: string | null;
  saved?: {
    riskCount: number;
    signalCount: number;
  };
  error?: string;
};

export default function AdminRiskPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunRiskResponse | null>(null);
  const [error, setError] = useState<string>("");

  const onRun = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/run-risk", {
        method: "POST"
      });
      const data = (await res.json()) as RunRiskResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "위험 점수 계산 실행에 실패했습니다.");
      }

      setResult(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Risk Admin (Test)</h1>

      <div className="mt-4">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? "실행 중..." : "위험 점수 계산 실행"}
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-600">계산을 실행하고 있습니다...</p>}

      {result && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p>계산 완료</p>
          <p>계산된 risk 개수: {result.calculatedRiskCount ?? 0}</p>
          <p>계산된 signal 개수: {result.calculatedSignalCount ?? 0}</p>
          <p>저장된 risk 개수: {result.saved?.riskCount ?? 0}</p>
          <p>저장된 signal 개수: {result.saved?.signalCount ?? 0}</p>
          {result.warning && <p className="mt-2 font-medium text-amber-700">경고: {result.warning}</p>}
        </div>
      )}

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">오류: {error}</div>}
    </main>
  );
}
