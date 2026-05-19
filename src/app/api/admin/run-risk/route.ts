import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { runRiskCalculation } from "@/lib/runRiskCalculation";

export async function POST() {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runRiskCalculation({ debug: true });
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
