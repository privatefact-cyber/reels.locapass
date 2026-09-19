import { redirect } from "next/navigation";

// 店舗管理画面は /dashboard/shop/[shopId] に移した(旧URLのブックマーク・共有リンク用の転送)。
// 転送先でも店舗ごとの権限チェック(locapass_is_shop_admin)を必ず通る。
export default async function LegacyShopDashboardRedirect({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  redirect(`/dashboard/shop/${path.map(encodeURIComponent).join("/")}`);
}
