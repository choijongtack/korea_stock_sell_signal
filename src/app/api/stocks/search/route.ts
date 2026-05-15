import { NextResponse } from "next/server";
import { getSupabaseReadClient } from "@/lib/supabaseAdmin";
import type { StockSearchResult } from "@/types/stocks";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = (searchParams.get("q") ?? "").trim();

    if (!keyword) {
      return NextResponse.json({ ok: true, data: [] as StockSearchResult[] });
    }

    const supabase = getSupabaseReadClient();
    const { data, error } = await supabase
      .from("stocks")
      .select("stock_code, stock_name, market, last_close, trade_date")
      .or(`stock_name.ilike.%${keyword}%,stock_code.ilike.%${keyword}%`)
      .order("market", { ascending: true })
      .order("stock_name", { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: (data ?? []) as StockSearchResult[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
