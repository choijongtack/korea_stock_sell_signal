"use client";

import { useState } from "react";
import StockSearchBox from "@/components/stocks/StockSearchBox";
import type { StockSearchResult } from "@/types/stocks";

export default function StockSearchTestPage() {
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">종목 검색 테스트</h1>
        <p className="mt-2 text-sm text-gray-500">종목명 또는 종목코드를 입력해서 stocks 테이블 검색을 확인합니다.</p>
      </div>

      <StockSearchBox onSelect={setSelectedStock} />

      {selectedStock && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">선택된 종목</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">종목명</span>
              <span className="font-medium">{selectedStock.stock_name}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">종목코드</span>
              <span className="font-medium">{selectedStock.stock_code}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">시장</span>
              <span className="font-medium">{selectedStock.market}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">최근 종가</span>
              <span className="font-medium">{selectedStock.last_close ? `${Number(selectedStock.last_close).toLocaleString()}원` : "-"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">기준일</span>
              <span className="font-medium">{selectedStock.trade_date ?? "-"}</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
