import { NextResponse } from "next/server";
import { syncMarketBreadthDaily } from "@/lib/syncMarketBreadth";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;

    const result = await syncMarketBreadthDaily(lastDays);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message)
          : JSON.stringify(error);
    return NextResponse.json({ ok: false, error: message || "Unknown error" }, { status: 500 });
  }
}

