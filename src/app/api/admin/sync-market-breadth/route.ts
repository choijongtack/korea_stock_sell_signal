import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      paused: true,
      message: "KRX market breadth sync is temporarily paused."
    },
    { status: 503 }
  );
}
