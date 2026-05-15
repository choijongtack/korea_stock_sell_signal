import "server-only";
import { getKisCurrentPrice } from "@/lib/price/getKisCurrentPrice";
import { getKrxLastClose } from "@/lib/price/getKrxLastClose";
import type { RealtimePrice } from "@/lib/price/types";

export type { RealtimePrice } from "@/lib/price/types";

export async function getRealtimePrice(stockCode: string): Promise<RealtimePrice> {
  // 1차: 한국투자 현재가 API
  try {
    return await getKisCurrentPrice(stockCode);
  } catch {
    // 실패 시: stocks.last_close 사용
    return getKrxLastClose(stockCode);
  }
}
