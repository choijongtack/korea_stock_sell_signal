export type MarketType = "KOSPI" | "KOSDAQ";

export type StockMaster = {
  id?: string;
  stock_code: string;
  stock_name: string;
  market: MarketType;
  last_close: number | null;
  last_volume: number | null;
  trade_date: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StockSearchResult = {
  stock_code: string;
  stock_name: string;
  market: MarketType;
  last_close: number | null;
  trade_date: string | null;
};

export type KrxDailyStockRow = {
  BAS_DD: string;
  MKT_NM: string;
  ISU_CD: string;
  ISU_NM: string;
  TDD_CLSPRC?: string;
  ACC_TRDVOL?: string;
};
