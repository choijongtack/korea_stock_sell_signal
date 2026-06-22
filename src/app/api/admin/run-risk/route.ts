import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "기존 market_risk_daily 기반 위험점수 계산은 비활성화되었습니다. KOSPI 위험 상태 지수 모델을 사용하세요."
    },
    { status: 410 }
  );
}
