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
const latest = rows.reduce((m, r) => (r.trade_date && (!m || r.trade_date > m) ? r.trade_date : m), null);
const latestRows = rows.filter((r) => r.trade_date === latest);

const byMarket = new Map();
for (const r of latestRows) {
  const key = String(r.market ?? "UNKNOWN");
  if (!byMarket.has(key)) byMarket.set(key, new Set());
  byMarket.get(key).add(String(r.stock_code));
}

const result = {
  latest_trade_date: latest,
  latest_rows: latestRows.length,
  latest_distinct_kospi: byMarket.get("KOSPI")?.size ?? 0,
  latest_distinct_kosdaq: byMarket.get("KOSDAQ")?.size ?? 0,
  latest_distinct_total: (byMarket.get("KOSPI")?.size ?? 0) + (byMarket.get("KOSDAQ")?.size ?? 0)
};

console.log(JSON.stringify(result));
