create table if not exists public.market_risk_ai_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  prompt_version text not null,
  input_hash text not null,
  model text not null,
  source text not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_date, prompt_version)
);

create index if not exists idx_market_risk_ai_reports_report_date
  on public.market_risk_ai_reports (report_date desc);

create index if not exists idx_market_risk_ai_reports_input_hash
  on public.market_risk_ai_reports (input_hash);
