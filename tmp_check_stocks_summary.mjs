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

const [{ count }, latestRes] = await Promise.all([
  supabase.from("stocks").select("*", { count: "exact", head: true }),
  supabase.from("stocks").select("trade_date").order("trade_date", { ascending: false }).limit(1)
]);

if (latestRes.error) {
  console.error(latestRes.error.message);
  process.exit(1);
}

console.log(JSON.stringify({ total_rows: count ?? 0, latest_trade_date: latestRes.data?.[0]?.trade_date ?? null }));
