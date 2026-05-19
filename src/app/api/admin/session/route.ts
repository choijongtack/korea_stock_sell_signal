import { NextResponse } from "next/server";
import { clearAdminSessionCookie, isAdminAccessCode, isAdminMode, setAdminSessionCookie } from "@/lib/adminAuth";

export async function GET() {
  return NextResponse.json({ isAdmin: await isAdminMode() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };

  if (!body.code || !isAdminAccessCode(body.code)) {
    return NextResponse.json({ ok: false, error: "Invalid admin code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setAdminSessionCookie(response);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
