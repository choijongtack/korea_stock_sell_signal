create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  last_close numeric,
  last_volume numeric,
  trade_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (stock_code, market)
);

create index if not exists idx_stocks_stock_code on public.stocks (stock_code);
create index if not exists idx_stocks_stock_name on public.stocks (stock_name);
create index if not exists idx_stocks_market on public.stocks (market);
