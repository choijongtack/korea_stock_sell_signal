create table if not exists public.market_m2_monthly (
  trade_date date primary key,
  source_time text not null,
  m2_billion_krw numeric not null,
  unit_name text not null default '십억원',
  stat_code text not null default '161Y006',
  item_code text not null default 'BBHA00',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_market_m2_monthly_source_time
  on public.market_m2_monthly (source_time);
