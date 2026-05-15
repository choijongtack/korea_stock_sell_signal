"use client";

import { useEffect, useMemo, useState } from "react";
import { searchStocks } from "@/lib/stocks/searchStocks";
import type { StockSearchResult } from "@/types/stocks";

type StockSearchBoxProps = {
  onSelect: (stock: StockSearchResult) => void;
  placeholder?: string;
};

export default function StockSearchBox({
  onSelect,
  placeholder = "종목명 또는 종목코드 입력"
}: StockSearchBoxProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSearch = useMemo(() => keyword.trim().length >= 1, [keyword]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setErrorMessage(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const data = await searchStocks(keyword);
        setResults(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("종목 검색 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [keyword, canSearch]);

  function handleSelect(stock: StockSearchResult) {
    setSelectedStock(stock);
    setKeyword(`${stock.stock_name} (${stock.stock_code})`);
    setResults([]);
    onSelect(stock);
  }

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <input
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setSelectedStock(null);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        {loading && <div className="absolute right-3 top-3 text-xs text-gray-400">검색 중...</div>}
      </div>

      {errorMessage && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMessage}</div>}

      {results.length > 0 && !selectedStock && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {results.map((stock) => (
            <button
              key={`${stock.market}-${stock.stock_code}`}
              type="button"
              onClick={() => handleSelect(stock)}
              className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
            >
              <div>
                <div className="font-medium text-gray-900">{stock.stock_name}</div>
                <div className="text-xs text-gray-500">
                  {stock.stock_code} · {stock.market}
                </div>
              </div>

              <div className="text-right text-xs text-gray-500">
                {stock.last_close ? `${Number(stock.last_close).toLocaleString()}원` : "-"}
                <div>{stock.trade_date ?? ""}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {canSearch && results.length === 0 && !loading && !selectedStock && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">검색 결과가 없습니다. 먼저 KRX 종목 마스터 동기화가 필요할 수 있습니다.</div>
      )}
    </div>
  );
}
