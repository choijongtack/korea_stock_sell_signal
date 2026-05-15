import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const { getSupabaseReadClient } = await import("./src/lib/supabaseAdmin.ts");
const supabase = getSupabaseReadClient();

const { data, error } = await supabase.from("stocks").select("stock_code,market,trade_date");
if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
const kospi = new Set();
const kosdaq = new Set();
for (const r of rows) {
  if (r.market === "KOSPI") kospi.add(String(r.stock_code));
  if (r.market === "KOSDAQ") kosdaq.add(String(r.stock_code));
}

const sampleLatest = rows
  .sort((a, b) => String(b.trade_date ?? "").localeCompare(String(a.trade_date ?? "")))
  .slice(0, 10)
  .map((r) => ({ code: r.stock_code, market: r.market, date: r.trade_date }));

console.log(JSON.stringify({
  distinct_kospi_all_dates: kospi.size,
  distinct_kosdaq_all_dates: kosdaq.size,
  distinct_total_all_dates: kospi.size + kosdaq.size,
  sample_latest_rows: sampleLatest
}));
