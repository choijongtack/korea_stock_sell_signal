import "server-only";
import { getSupabaseReadClient } from "@/lib/supabaseAdmin";
import type { RealtimePrice } from "@/lib/price/types";

export async function getKrxLastClose(stockCode: string): Promise<RealtimePrice> {
  const supabase = getSupabaseReadClient();

  const { data, error } = await supabase
    .from("stocks")
    .select("stock_code, stock_name, last_close, trade_date, last_volume")
    .eq("stock_code", stockCode)
    .order("trade_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.last_close == null) {
    throw new Error(`No KRX last close found for stock_code=${stockCode}`);
  }

  return {
    stock_code: String(data.stock_code),
    stock_name: data.stock_name ? String(data.stock_name) : undefined,
    current_price: Number(data.last_close),
    volume: data.last_volume == null ? undefined : Number(data.last_volume),
    source: "KRX",
    fetched_at: new Date().toISOString()
  };
}
