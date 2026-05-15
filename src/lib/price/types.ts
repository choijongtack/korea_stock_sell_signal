export type RealtimePrice = {
  stock_code: string;
  stock_name?: string;
  current_price: number;
  change_rate?: number;
  volume?: number;
  source: "KIS" | "KRX";
  fetched_at: string;
};
