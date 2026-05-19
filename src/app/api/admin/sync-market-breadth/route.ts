import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";

export async function POST() {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      ok: false,
      paused: true,
      message: "KRX market breadth sync is temporarily paused."
    },
    { status: 503 }
  );
}
