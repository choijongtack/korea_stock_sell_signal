"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { HoldingsTable } from "@/components/HoldingsTable";

type HoldingAction = "보유" | "일부 익절" | "비중 축소" | "매도 검토";

interface HoldingInput {
  name: string;
  code: string;
  avgBuyPrice: string;
  quantity: string;
  holdingPeriodDays: string;
  usingCredit: boolean;
  currentPrice: string;
  dropFromPeakPct: string;
  belowMa20: boolean;
  belowMa60: boolean;
}

interface HoldingItem {
  id: string;
  name: string;
  code: string;
  avgBuyPrice: number;
  quantity: number;
  holdingPeriodDays: number;
  usingCredit: boolean;
  currentPrice: number;
  dropFromPeakPct: number;
  belowMa20: boolean;
  belowMa60: boolean;
}

const defaultForm: HoldingInput = {
  name: "",
  code: "",
  avgBuyPrice: "",
  quantity: "",
  holdingPeriodDays: "",
  usingCredit: false,
  currentPrice: "",
  dropFromPeakPct: "",
  belowMa20: false,
  belowMa60: false
};

function calculateReturnPct(avgBuyPrice: number, currentPrice: number): number {
  if (avgBuyPrice <= 0) return 0;
  return ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
}

function calculateRiskScore(item: HoldingItem): number {
  let score = 0;
  const returnPct = calculateReturnPct(item.avgBuyPrice, item.currentPrice);
  if (item.dropFromPeakPct >= 10) score += 20;
  else if (item.dropFromPeakPct >= 5) score += 10;
  if (item.belowMa20) score += 15;
  if (item.belowMa60) score += 25;
  if (returnPct < -10) score += 20;
  else if (returnPct < -5) score += 12;
  else if (returnPct < 0) score += 6;
  if (item.holdingPeriodDays <= 20) score += 10;
  else if (item.holdingPeriodDays <= 60) score += 5;
  if (item.usingCredit) score += 20;
  return Math.min(100, score);
}

function riskToAction(score: number): HoldingAction {
  if (score >= 75) return "매도 검토";
  if (score >= 55) return "비중 축소";
  if (score >= 35) return "일부 익절";
  return "보유";
}

export default function HoldingsPage() {
  const [form, setForm] = useState<HoldingInput>(defaultForm);
  const [items, setItems] = useState<HoldingItem[]>([]);
  const [error, setError] = useState("");

  const evaluated = useMemo(
    () =>
      items.map((item) => {
        const returnPct = calculateReturnPct(item.avgBuyPrice, item.currentPrice);
        const riskScore = calculateRiskScore(item);
        const action = riskToAction(riskScore);
        return { ...item, returnPct, riskScore, action };
      }),
    [items]
  );

  const handleAdd = () => {
    setError("");
    if (!form.name || !form.code || !form.avgBuyPrice || !form.quantity || !form.holdingPeriodDays || !form.currentPrice) {
      setError("필수 입력값을 모두 입력해 주세요.");
      return;
    }
    const avgBuyPrice = Number(form.avgBuyPrice);
    const quantity = Number(form.quantity);
    const holdingPeriodDays = Number(form.holdingPeriodDays);
    const currentPrice = Number(form.currentPrice);
    const dropFromPeakPct = Number(form.dropFromPeakPct || "0");
    if ([avgBuyPrice, quantity, holdingPeriodDays, currentPrice, dropFromPeakPct].some((n) => Number.isNaN(n) || n < 0)) {
      setError("숫자 입력값을 확인해 주세요.");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: `${form.code}-${Date.now()}`,
        name: form.name.trim(),
        code: form.code.trim(),
        avgBuyPrice,
        quantity,
        holdingPeriodDays,
        usingCredit: form.usingCredit,
        currentPrice,
        dropFromPeakPct,
        belowMa20: form.belowMa20,
        belowMa60: form.belowMa60
      }
    ]);
    setForm(defaultForm);
  };

  const handleDelete = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  return (
    <AppLayout title="보유 종목 위험 진단" description="보유/일부 익절/비중 축소/매도 검토 신호를 종목별로 확인합니다.">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h2 className="text-lg font-semibold">종목 입력</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="종목명" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="종목코드" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="평균매수가" value={form.avgBuyPrice} onChange={(e) => setForm((s) => ({ ...s, avgBuyPrice: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="수량" value={form.quantity} onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="보유기간(일)" value={form.holdingPeriodDays} onChange={(e) => setForm((s) => ({ ...s, holdingPeriodDays: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="현재가" value={form.currentPrice} onChange={(e) => setForm((s) => ({ ...s, currentPrice: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm md:col-span-2" placeholder="고점 대비 하락률(%)" value={form.dropFromPeakPct} onChange={(e) => setForm((s) => ({ ...s, dropFromPeakPct: e.target.value }))} />
        </div>
        <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.usingCredit} onChange={(e) => setForm((s) => ({ ...s, usingCredit: e.target.checked }))} />신용사용</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.belowMa20} onChange={(e) => setForm((s) => ({ ...s, belowMa20: e.target.checked }))} />20일선 이탈</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.belowMa60} onChange={(e) => setForm((s) => ({ ...s, belowMa60: e.target.checked }))} />60일선 이탈</label>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button type="button" onClick={handleAdd} className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">종목 추가</button>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h2 className="text-lg font-semibold">보유 종목 목록</h2>
        <HoldingsTable items={evaluated} onDelete={handleDelete} />
      </section>
    </AppLayout>
  );
}
