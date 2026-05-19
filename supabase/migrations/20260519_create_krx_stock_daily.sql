create table if not exists public.krx_stock_daily (
  trade_date date not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  stock_code text not null,
  stock_name text not null,
  close_price numeric,
  change_price numeric,
  change_rate numeric,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  volume numeric,
  trading_value_krw numeric,
  market_cap_krw numeric,
  listed_shares numeric,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (trade_date, market, stock_code)
);

create index if not exists idx_krx_stock_daily_trade_date
  on public.krx_stock_daily (trade_date);

create index if not exists idx_krx_stock_daily_market_date
  on public.krx_stock_daily (market, trade_date);
