"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";

type UpdateResponse = {
  ok: boolean;
  error?: string;
  includeDataSync?: boolean;
  lastDays?: number;
  syncResults?: Array<{
    name: string;
    ok: boolean;
    result?: {
      inserted?: number;
      datesTried?: number;
      datesSucceeded?: number;
      warnings?: string[];
    };
    error?: string;
  }>;
  model?: {
    ok: boolean;
    metrics?: {
      latest?: {
        date?: string;
        kospiClose?: number;
        riskScore?: number;
        riskLevel?: string;
      } | null;
      scope?: {
        startDate?: string | null;
        endDate?: string | null;
        kospiRows?: number;
      };
      model?: {
        all?: {
          pearsonReturn?: number | null;
          spearmanReturn?: number | null;
          aucDownside?: number | null;
        };
        forward5ValidationAll?: {
          aucDownside?: number | null;
        };
        forwardValidationAll?: {
          aucDownside?: number | null;
        };
      };
    } | null;
    stderr?: string | null;
  };
};

function formatNumber(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "-";
}

function formatRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "-";
}

export default function AdminRiskPage() {
  const [includeDataSync, setIncludeDataSync] = useState(true);
  const [lastDays, setLastDays] = useState(30);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<UpdateResponse | null>(null);

  const warningCount = useMemo(
    () =>
      response?.syncResults?.reduce((sum, item) => {
        return sum + (item.result?.warnings?.length ?? 0) + (item.ok ? 0 : 1);
      }, 0) ?? 0,
    [response]
  );

  async function runUpdate() {
    setIsRunning(true);
    setResponse(null);
    try {
      const res = await fetch("/api/admin/update-kospi-risk-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeDataSync, lastDays })
      });
      const json = (await res.json()) as UpdateResponse;
      setResponse(json);
    } catch (error) {
      setResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsRunning(false);
    }
  }

  const latest = response?.model?.metrics?.latest;
  const modelAll = response?.model?.metrics?.model?.all;

  return (
    <AppLayout title="KOSPI 위험 상태 지수 업데이트" description="원천 데이터 업데이트 후 KOSPI 위험 상태 지수를 다시 계산해 저장합니다.">
      <main className="mx-auto max-w-5xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-950">KOSPI 위험 상태 지수 업데이트</h1>
        <p className="text-sm leading-6 text-slate-600">
          최신 원천 데이터를 먼저 업데이트한 뒤, 현재 확정한 <code className="rounded bg-slate-100 px-1 py-0.5">kospi_corr_state_v1</code> 모델을 다시 계산해{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">kospi_risk_state_daily</code>에 저장합니다.
        </p>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeDataSync}
              onChange={(event) => setIncludeDataSync(event.target.checked)}
              className="mt-1 h-4 w-4"
              disabled={isRunning}
            />
            <span>
              <span className="block font-semibold text-slate-950">원천 데이터 업데이트 포함</span>
              <span className="mt-1 block leading-5">
                KRX 지수/시총, KOFIA 예탁금/신용/CMA, KIS 수급, ECOS M2, 시장 breadth를 가능한 최신 날짜까지 갱신합니다.
              </span>
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            업데이트 탐색 기간
            <input
              type="number"
              min={1}
              max={365}
              value={lastDays}
              onChange={(event) => setLastDays(Number(event.target.value))}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={isRunning || !includeDataSync}
            />
          </label>

          <button
            type="button"
            onClick={runUpdate}
            disabled={isRunning}
            className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isRunning ? "업데이트 중..." : "데이터 업데이트 + 위험 지수 갱신"}
          </button>
        </div>
      </section>

      {response ? (
        <section className="mt-6 space-y-4">
          <div
            className={`rounded-lg border p-4 text-sm ${
              response.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {response.ok ? "업데이트 실행이 완료되었습니다." : `업데이트 실패: ${response.error ?? "알 수 없는 오류"}`}
          </div>

          {latest ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">최신 저장일</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">{latest.date ?? "-"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">KOSPI 종가</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(latest.kospiClose, 2)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">위험 점수</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(latest.riskScore, 1)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">위험 단계</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">{latest.riskLevel ?? "-"}</div>
              </div>
            </div>
          ) : null}

          {modelAll ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <h2 className="font-semibold text-slate-950">모델 검증 요약</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-500">KOSPI 20일 하락 상태와 상관</div>
                  <div className="mt-1 font-semibold text-slate-950">Pearson {formatRate(modelAll.pearsonReturn)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">순위 상관</div>
                  <div className="mt-1 font-semibold text-slate-950">Spearman {formatRate(modelAll.spearmanReturn)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">미래 예측 AUC 참고값</div>
                  <div className="mt-1 font-semibold text-slate-950">
                    5일 {formatRate(response.model?.metrics?.model?.forward5ValidationAll?.aucDownside)} / 20일{" "}
                    {formatRate(response.model?.metrics?.model?.forwardValidationAll?.aucDownside)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {response.syncResults?.length ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">원천 데이터 업데이트 결과</h2>
                <span className="text-xs text-slate-500">경고/실패 {warningCount}건</span>
              </div>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {response.syncResults.map((item) => (
                  <div key={item.name} className="grid gap-2 py-3 md:grid-cols-[220px_1fr]">
                    <div className={item.ok ? "font-medium text-slate-900" : "font-medium text-rose-700"}>{item.name}</div>
                    <div className="text-slate-600">
                      {item.ok
                        ? `저장 ${item.result?.inserted ?? 0}건, 시도 ${item.result?.datesTried ?? 0}일, 성공 ${item.result?.datesSucceeded ?? 0}일`
                        : item.error}
                      {item.result?.warnings?.slice(0, 2).map((warning) => (
                        <div key={warning} className="mt-1 text-xs text-amber-700">
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      </main>
    </AppLayout>
  );
}
