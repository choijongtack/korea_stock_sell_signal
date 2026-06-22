export default function AdminRiskPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Risk Admin</h1>
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        기존 `market_risk_daily` 기반 위험점수 계산은 비활성화되었습니다. 현재 대시보드는 원천 데이터를 기반으로 KOSPI 위험 상태 지수를 직접 계산합니다.
      </div>
      <div className="mt-4 rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        새 모델 검증은 로컬에서 <code className="rounded bg-slate-100 px-1 py-0.5">npm run risk:model</code> 명령으로 실행합니다.
      </div>
    </main>
  );
}
