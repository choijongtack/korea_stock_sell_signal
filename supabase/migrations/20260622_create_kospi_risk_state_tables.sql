create table if not exists public.kospi_risk_state_model_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null unique,
  model_name text not null default 'KOSPI Risk State Index',
  target_name text not null,
  target_description text,
  target_horizon_days integer not null default 20,
  target_threshold_pct numeric not null default -3,
  feature_names text[] not null default '{}',
  coefficients jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.kospi_risk_state_daily (
  trade_date date not null,
  model_version text not null references public.kospi_risk_state_model_runs(model_version) on delete cascade,
  kospi_close numeric,
  risk_score numeric not null check (risk_score >= 0 and risk_score <= 100),
  risk_level text not null check (risk_level in ('stable', 'caution', 'warning', 'danger', 'crisis')),
  summary text,
  components jsonb not null default '{}'::jsonb,
  feature_values jsonb not null default '{}'::jsonb,
  kospi_return_5d numeric,
  kospi_return_20d numeric,
  kospi_forward_return_5d numeric,
  kospi_forward_return_20d numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trade_date, model_version)
);

create index if not exists idx_kospi_risk_state_daily_version_date
  on public.kospi_risk_state_daily (model_version, trade_date desc);

create index if not exists idx_kospi_risk_state_daily_score
  on public.kospi_risk_state_daily (model_version, risk_score desc);

create index if not exists idx_kospi_risk_state_daily_level
  on public.kospi_risk_state_daily (model_version, risk_level, trade_date desc);
