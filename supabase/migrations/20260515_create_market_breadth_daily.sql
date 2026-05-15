create table if not exists public.market_breadth_daily (
  trade_date date not null,
  market text not null,
  advancers integer not null,
  decliners integer not null,
  unchanged integer not null,
  trading_value_million_krw numeric not null,
  created_at timestamptz default now(),
  primary key (trade_date, market)
);

create index if not exists idx_market_breadth_daily_trade_date on public.market_breadth_daily (trade_date);
