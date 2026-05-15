import "server-only";
import type { RealtimePrice } from "@/lib/price/types";

export async function getKisCurrentPrice(_stockCode: string): Promise<RealtimePrice> {
  // TODO: Implement with KIS current-price API adapter.
  throw new Error("Not implemented yet");
}
