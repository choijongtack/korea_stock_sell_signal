"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { HoldingsTable } from "@/components/HoldingsTable";
import type { HoldingStock, MarketType, RiskLevel, StockRiskResult, StockRiskSignal } from "@/types/portfolioRisk";

type HoldingInput = {
  stock_name: string;
  stock_code: string;
  market: MarketType;
  buy_price: string;
  current_price: string;
  quantity: string;
  holdingPeriodDays: string;
  usingCredit: boolean;
  dropFromPeakPct: string;
  belowMa20: boolean;
  belowMa60: boolean;
};

type LocalHolding = HoldingStock & {
  id: string;
  holdingPeriodDays: number;
  usingCredit: boolean;
  dropFromPeakPct: number;
  belowMa20: boolean;
  belowMa60: boolean;
};

const defaultForm: HoldingInput = {
  stock_name: "",
  stock_code: "",
  market: "KOSPI",
  buy_price: "",
  current_price: "",
  quantity: "",
  holdingPeriodDays: "",
  usingCredit: false,
  dropFromPeakPct: "",
  belowMa20: false,
  belowMa60: false
};

function calculateProfitRate(buyPrice: number, currentPrice: number): number {
  if (buyPrice <= 0) return 0;
  return ((currentPrice - buyPrice) / buyPrice) * 100;
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "danger";
  if (score >= 40) return "caution";
  return "safe";
}

function scoreToRecommendation(score: number): string {
  if (score >= 75) return "매도 검토";
  if (score >= 55) return "비중 축소";
  if (score >= 35) return "일부 익절";
  return "보유";
}

function buildSignals(item: LocalHolding, profitRate: number): StockRiskSignal[] {
  const signals: StockRiskSignal[] = [];

  if (item.dropFromPeakPct >= 10) {
    signals.push({ signal_type: "drawdown", severity: "danger", score_delta: 20, title: "고점 대비 하락 확대", description: "고점 대비 10% 이상 하락했습니다." });
  } else if (item.dropFromPeakPct >= 5) {
    signals.push({ signal_type: "drawdown", severity: "caution", score_delta: 10, title: "고점 대비 하락", description: "고점 대비 5% 이상 하락했습니다." });
  }

  if (item.belowMa60) {
    signals.push({ signal_type: "ma_break", severity: "danger", score_delta: 25, title: "60일선 이탈", description: "중기 추세가 약화되었습니다." });
  } else if (item.belowMa20) {
    signals.push({ signal_type: "ma_break", severity: "caution", score_delta: 15, title: "20일선 이탈", description: "단기 추세가 약화되었습니다." });
  }

  if (profitRate < -10) {
    signals.push({ signal_type: "loss", severity: "danger", score_delta: 20, title: "손실 구간 확대", description: "손실률이 -10% 미만입니다." });
  } else if (profitRate < -5) {
    signals.push({ signal_type: "loss", severity: "caution", score_delta: 12, title: "손실 구간", description: "손실률이 -5% 미만입니다." });
  }

  if (item.usingCredit) {
    signals.push({ signal_type: "credit", severity: "danger", score_delta: 20, title: "신용 사용", description: "레버리지 사용으로 변동성 리스크가 커질 수 있습니다." });
  }

  return signals;
}

function evaluateHolding(item: LocalHolding): StockRiskResult {
  let riskScore = 0;
  const profitRate = calculateProfitRate(item.buy_price, item.current_price);

  if (item.dropFromPeakPct >= 10) riskScore += 20;
  else if (item.dropFromPeakPct >= 5) riskScore += 10;

  if (item.belowMa20) riskScore += 15;
  if (item.belowMa60) riskScore += 25;

  if (profitRate < -10) riskScore += 20;
  else if (profitRate < -5) riskScore += 12;
  else if (profitRate < 0) riskScore += 6;

  if (item.holdingPeriodDays <= 20) riskScore += 10;
  else if (item.holdingPeriodDays <= 60) riskScore += 5;

  if (item.usingCredit) riskScore += 20;

  const boundedScore = Math.min(100, riskScore);
  const valuationAmount = item.current_price * item.quantity;
  const buyAmount = item.buy_price * item.quantity;
  const lossAmount = Math.max(0, buyAmount - valuationAmount);

  return {
    stock_code: item.stock_code,
    stock_name: item.stock_name,
    market: item.market,
    profit_rate: profitRate,
    loss_amount: lossAmount,
    valuation_amount: valuationAmount,
    risk_score: boundedScore,
    risk_level: scoreToRiskLevel(boundedScore),
    signals: buildSignals(item, profitRate),
    recommendation: scoreToRecommendation(boundedScore)
  };
}

export default function HoldingsPage() {
  const [form, setForm] = useState<HoldingInput>(defaultForm);
  const [items, setItems] = useState<LocalHolding[]>([]);
  const [error, setError] = useState("");

  const evaluated = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        stock: evaluateHolding(item),
        dropFromPeakPct: item.dropFromPeakPct,
        belowMa20: item.belowMa20,
        belowMa60: item.belowMa60,
        usingCredit: item.usingCredit
      })),
    [items]
  );

  const handleAdd = () => {
    setError("");
    if (!form.stock_name || !form.stock_code || !form.buy_price || !form.quantity || !form.holdingPeriodDays || !form.current_price) {
      setError("필수 입력값을 모두 입력해 주세요.");
      return;
    }

    const buyPrice = Number(form.buy_price);
    const quantity = Number(form.quantity);
    const holdingPeriodDays = Number(form.holdingPeriodDays);
    const currentPrice = Number(form.current_price);
    const dropFromPeakPct = Number(form.dropFromPeakPct || "0");

    if ([buyPrice, quantity, holdingPeriodDays, currentPrice, dropFromPeakPct].some((n) => Number.isNaN(n) || n < 0)) {
      setError("숫자 입력값을 확인해 주세요.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        id: `${form.stock_code}-${Date.now()}`,
        stock_name: form.stock_name.trim(),
        stock_code: form.stock_code.trim(),
        market: form.market,
        buy_price: buyPrice,
        current_price: currentPrice,
        quantity,
        holdingPeriodDays,
        usingCredit: form.usingCredit,
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
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="종목명" value={form.stock_name} onChange={(e) => setForm((s) => ({ ...s, stock_name: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="종목코드" value={form.stock_code} onChange={(e) => setForm((s) => ({ ...s, stock_code: e.target.value }))} />
          <select className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" value={form.market} onChange={(e) => setForm((s) => ({ ...s, market: e.target.value as MarketType }))}>
            <option value="KOSPI">KOSPI</option>
            <option value="KOSDAQ">KOSDAQ</option>
          </select>
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="평균매수가" value={form.buy_price} onChange={(e) => setForm((s) => ({ ...s, buy_price: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="수량" value={form.quantity} onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="보유기간(일)" value={form.holdingPeriodDays} onChange={(e) => setForm((s) => ({ ...s, holdingPeriodDays: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="현재가" value={form.current_price} onChange={(e) => setForm((s) => ({ ...s, current_price: e.target.value }))} />
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
