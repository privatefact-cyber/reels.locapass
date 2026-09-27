import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shopPath } from "@/lib/locapass/publicUrls";

// 店舗版の短縮URL(/s/AB12CD)。QRコード等で配布する用の恒久的なコードで、
// 着地先はslugベースの公開ページ(/{portalSlug}/shops/[shopSlug])。
export default async function ShopShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("slug, portal:locapass_portals ( slug )")
    .eq("shop_code", code.toUpperCase())
    .maybeSingle();

  const portal = Array.isArray(shop?.portal) ? shop.portal[0] : shop?.portal;

  if (!shop || !portal) {
    notFound();
  }

  redirect(shopPath(portal.slug, shop.slug));
}
