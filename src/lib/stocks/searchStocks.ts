import type { StockSearchResult } from "@/types/stocks";

export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  const normalized = keyword.trim();

  if (!normalized) return [];

  const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(normalized)}`);
  const json = (await res.json()) as { ok: boolean; data?: StockSearchResult[]; error?: string };

  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Stock search failed");
  }

  return json.data ?? [];
}
