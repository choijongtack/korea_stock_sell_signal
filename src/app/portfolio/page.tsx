"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { HoldingRiskCard } from "@/components/portfolio/HoldingRiskCard";
import { PortfolioRiskSummary } from "@/components/portfolio/PortfolioRiskSummary";
import StockSearchBox from "@/components/stocks/StockSearchBox";
import { diagnosePortfolioRisk, type MarketRiskInput } from "@/lib/portfolioRisk";
import type { StockSearchResult } from "@/types/stocks";
import type { HoldingStock, MarketType, RiskLevel } from "@/types/portfolioRisk";

type FormState = {
  stock_name: string;
  stock_code: string;
  market: MarketType;
  buy_price: string;
  current_price: string;
  quantity: string;
};

const defaultForm: FormState = {
  stock_name: "",
  stock_code: "",
  market: "KOSPI",
  buy_price: "",
  current_price: "",
  quantity: ""
};

export default function PortfolioPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [holdings, setHoldings] = useState<HoldingStock[]>([]);
  const [error, setError] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);

  const [kospiLevel, setKospiLevel] = useState<RiskLevel>("safe");
  const [kosdaqLevel, setKosdaqLevel] = useState<RiskLevel>("safe");

  const marketRisks: MarketRiskInput[] = useMemo(() => {
    const toScore = (level: RiskLevel) => (level === "danger" ? 80 : level === "caution" ? 50 : 20);
    return [
      { market: "KOSPI", market_risk_level: kospiLevel, market_risk_score: toScore(kospiLevel) },
      { market: "KOSDAQ", market_risk_level: kosdaqLevel, market_risk_score: toScore(kosdaqLevel) }
    ];
  }, [kospiLevel, kosdaqLevel]);

  const results = useMemo(() => diagnosePortfolioRisk(holdings, marketRisks), [holdings, marketRisks]);

  const onSelectStock = (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setForm((prev) => ({
      ...prev,
      stock_name: stock.stock_name,
      stock_code: stock.stock_code,
      market: stock.market,
      current_price: stock.last_close == null ? prev.current_price : String(stock.last_close)
    }));
  };

  const onResetStock = () => {
    setSelectedStock(null);
    setForm((prev) => ({ ...prev, stock_name: "", stock_code: "", market: "KOSPI" }));
  };

  const onFetchCurrentPrice = async () => {
    if (!form.stock_code) return;
    setPriceLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/price/realtime?stockCode=${encodeURIComponent(form.stock_code)}`);
      const json = (await res.json()) as { ok: boolean; data?: { current_price: number }; error?: string };
      if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "현재가 조회 실패");
      setForm((prev) => ({ ...prev, current_price: String(json.data!.current_price) }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "현재가 조회 중 오류";
      setError(message);
    } finally {
      setPriceLoading(false);
    }
  };

  const onAdd = () => {
    setError("");
    if (!selectedStock) {
      setError("종목 검색 결과에서 종목을 먼저 선택해 주세요.");
      return;
    }
    if (!form.stock_name || !form.stock_code || !form.buy_price || !form.current_price || !form.quantity) {
      setError("필수 입력값을 모두 입력해 주세요.");
      return;
    }

    const buyPrice = Number(form.buy_price);
    const currentPrice = Number(form.current_price);
    const quantity = Number(form.quantity);
    if ([buyPrice, currentPrice, quantity].some((n) => Number.isNaN(n) || n <= 0)) {
      setError("가격/수량은 0보다 큰 숫자여야 합니다.");
      return;
    }

    setHoldings((prev) => [
      ...prev,
      {
        stock_name: form.stock_name.trim(),
        stock_code: form.stock_code.trim(),
        market: form.market,
        buy_price: buyPrice,
        current_price: currentPrice,
        quantity
      }
    ]);

    setForm(defaultForm);
    setSelectedStock(null);
  };

  return (
    <AppLayout title="Portfolio Risk" description="보유 종목을 한 번에 진단하고 포트폴리오 위험을 요약합니다.">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h2 className="text-lg font-semibold">시장 위험도</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">KOSPI</span>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={kospiLevel} onChange={(e) => setKospiLevel(e.target.value as RiskLevel)}>
              <option value="safe">safe</option>
              <option value="caution">caution</option>
              <option value="danger">danger</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">KOSDAQ</span>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={kosdaqLevel} onChange={(e) => setKosdaqLevel(e.target.value as RiskLevel)}>
              <option value="safe">safe</option>
              <option value="caution">caution</option>
              <option value="danger">danger</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h2 className="text-lg font-semibold">종목 추가</h2>

        <div className="mt-3">
          <label className="mb-1 block text-sm text-slate-700">종목 검색 (이름/코드)</label>
          <StockSearchBox onSelect={onSelectStock} placeholder="예: 삼성, 005930" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm" placeholder="종목명" value={form.stock_name} readOnly />
          <input className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm" placeholder="종목코드" value={form.stock_code} readOnly />
          <div className="flex gap-2">
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" value={form.market} onChange={(e) => setForm((s) => ({ ...s, market: e.target.value as MarketType }))}>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
            </select>
            <button type="button" onClick={onResetStock} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">초기화</button>
          </div>

          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="평균매수가" value={form.buy_price} onChange={(e) => setForm((s) => ({ ...s, buy_price: e.target.value }))} />
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="현재가" value={form.current_price} onChange={(e) => setForm((s) => ({ ...s, current_price: e.target.value }))} />
            <button type="button" onClick={onFetchCurrentPrice} disabled={!form.stock_code || priceLoading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">
              {priceLoading ? "조회중" : "현재가"}
            </button>
          </div>
          <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="수량" value={form.quantity} onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))} />
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button type="button" onClick={onAdd} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">추가</button>
      </section>

      <PortfolioRiskSummary results={results} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {results.map((result) => (
          <HoldingRiskCard key={`${result.stock_code}-${result.market}`} result={result} />
        ))}
      </section>
    </AppLayout>
  );
}
