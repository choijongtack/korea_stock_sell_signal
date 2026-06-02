import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { syncEcosM2Backfill, syncEcosM2Monthly, syncEcosM2Update } from "@/lib/syncEcosOpenApi";

type SyncType = "ecos_m2" | "ecos_m2_backfill" | "ecos_m2_update";

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { lastDays?: number; syncType?: SyncType };
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(body.lastDays, 1000) : 180;
    const syncType = body.syncType ?? "ecos_m2";

    if (syncType === "ecos_m2") {
      const result = await syncEcosM2Monthly(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "ecos_m2_backfill") {
      const result = await syncEcosM2Backfill(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    if (syncType === "ecos_m2_update") {
      const result = await syncEcosM2Update(lastDays);
      return NextResponse.json({ ok: true, syncType, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unsupported syncType: ${syncType}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
