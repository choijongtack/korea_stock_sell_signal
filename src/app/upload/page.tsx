import { redirect } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { DataUpload } from "@/components/DataUpload";
import { isAdminMode } from "@/lib/adminAuth";

export default async function UploadPage() {
  if (!(await isAdminMode())) {
    redirect("/admin?next=/upload");
  }

  return (
    <AppLayout title="데이터 업로드" description="CSV/Excel 파일을 업로드하고 정규화 후 저장합니다.">
      <DataUpload />
    </AppLayout>
  );
}
