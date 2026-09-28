import { redirect } from "next/navigation";
import { requireCurrentStaff } from "@/lib/staff/current-staff";
import { staffPath } from "@/lib/locapass/publicUrls";

/**
 * 旧マイページURL。今は公開プロフィールページ自体が本人ログイン時だけ管理UIを
 * 出す統合ページになったため、そちらへ転送するだけ(Instagramの自分のプロフィールと同じ設計)。
 */
export default async function StaffDashboardPage() {
  const staff = await requireCurrentStaff();
  if (!staff) redirect("/dashboard");

  const shop = Array.isArray(staff.locapass_shops) ? staff.locapass_shops[0] : staff.locapass_shops;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;

  if (!shop?.slug || !portal?.slug) {
    redirect("/dashboard");
  }

  redirect(staffPath(portal.slug, shop.slug, staff.issue_no));
}
