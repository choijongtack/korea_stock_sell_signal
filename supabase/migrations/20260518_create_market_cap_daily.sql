create table if not exists public.market_cap_daily (
  trade_date date not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  market_cap_million_krw numeric not null,
  listed_stock_count integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (trade_date, market)
);

create index if not exists idx_market_cap_daily_trade_date
  on public.market_cap_daily (trade_date);
