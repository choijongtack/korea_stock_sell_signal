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

const keyword = "삼성";
const { data, error } = await supabase
  .from("stocks")
  .select("stock_code, stock_name, market, last_close, trade_date")
  .or(`stock_name.ilike.%${keyword}%,stock_code.ilike.%${keyword}%`)
  .order("market", { ascending: true })
  .order("stock_name", { ascending: true })
  .limit(20);

if (error) {
  console.error("SEARCH_ERROR", error.message);
  process.exit(1);
}

console.log("COUNT", data?.length ?? 0);
for (const row of data ?? []) {
  console.log(`${row.market}\t${row.stock_code}\t${row.stock_name}\t${row.last_close ?? "-"}\t${row.trade_date ?? "-"}`);
}
