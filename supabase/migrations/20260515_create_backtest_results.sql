create extension if not exists pgcrypto;

create table if not exists public.backtest_results (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text,
  trade_date date not null,

  score numeric,
  risk_level text,
  market_regime text,
  action text,

  signal_type text,
  severity text,

  entry_price numeric,

  exit_price_1d numeric,
  exit_price_5d numeric,
  exit_price_10d numeric,
  exit_price_20d numeric,

  market_return_1d numeric,
  market_return_5d numeric,
  market_return_10d numeric,
  market_return_20d numeric,

  strategy_return_1d numeric,
  strategy_return_5d numeric,
  strategy_return_10d numeric,
  strategy_return_20d numeric,

  is_success_1d boolean,
  is_success_5d boolean,
  is_success_10d boolean,
  is_success_20d boolean,

  created_at timestamptz default now()
);

create index if not exists idx_backtest_results_source_type_trade_date
  on public.backtest_results (source_type, trade_date);

create index if not exists idx_backtest_results_signal
  on public.backtest_results (signal_type, severity);
