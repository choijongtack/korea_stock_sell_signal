import { redirect } from "next/navigation";
import { isAdminMode } from "@/lib/adminAuth";

export default async function AdminRiskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAdminMode())) {
    redirect("/admin?next=/admin/risk");
  }

  return children;
}
