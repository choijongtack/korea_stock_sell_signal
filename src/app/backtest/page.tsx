import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  return (
    <AppLayout title="Backtest Validation" description="KOSPI 위험 상태 지수 모델 검증">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">기존 위험지수 백테스트는 비활성화되었습니다</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          이 화면은 기존 `market_risk_daily` 기반 매도 위험 모델을 검증하던 페이지였습니다. 현재 UI는 KOSPI 위험 상태 지수 모델로 대체되었으므로旧 모델 백테스트를 실행하지 않습니다.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          새 모델 검증은 `npm run risk:model` 명령으로 확인합니다. 해당 명령은 원천 데이터를 읽어 현재 20거래일 KOSPI 약세 상태와의 상관, AUC, bucket별 결과를 출력합니다.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          대시보드로 이동
        </Link>
      </section>
    </AppLayout>
  );
}
