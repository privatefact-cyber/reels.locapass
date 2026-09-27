import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shopPath } from "@/lib/locapass/publicUrls";

// 旧UUID直リンク(/shops/[UUID])。過去に配布・インデックス済みのURLを生かすため、
// slugベースの新URL(/{portalSlug}/shops/[shopSlug])へ301相当で送る。
export default async function LegacyShopDetailRedirect({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("slug, portal:locapass_portals ( slug )")
    .eq("id", shopId)
    .maybeSingle();

  const portal = Array.isArray(shop?.portal) ? shop.portal[0] : shop?.portal;

  if (!shop || !portal) {
    notFound();
  }

  permanentRedirect(shopPath(portal.slug, shop.slug));
}
