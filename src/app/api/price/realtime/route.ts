import { NextResponse } from "next/server";
import { getRealtimePrice } from "@/lib/price/getRealtimePrice";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const stockCode = (searchParams.get("stockCode") ?? "").trim();
    if (!stockCode) {
      return NextResponse.json({ ok: false, error: "stockCode is required." }, { status: 400 });
    }

    const result = await getRealtimePrice(stockCode);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
