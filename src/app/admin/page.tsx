import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { isAdminMode } from "@/lib/adminAuth";

export default async function AdminPage() {
  const isAdmin = await isAdminMode();

  return (
    <AppLayout title="관리자 모드" description="관리자 코드로 데이터 업로드와 백테스트 기능을 활성화합니다.">
      <div className="mx-auto max-w-md">
        {isAdmin ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">관리자 모드가 활성화되어 있습니다.</h2>
              <p className="mt-1 text-sm text-slate-600">Upload와 Backtest 메뉴를 사용할 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/upload">
                Upload
              </Link>
              <Link className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/backtest">
                Backtest
              </Link>
              <AdminLogoutButton />
            </div>
          </div>
        ) : (
          <AdminLoginForm />
        )}
      </div>
    </AppLayout>
  );
}
