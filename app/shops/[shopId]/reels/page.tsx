import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shopReelsPath } from "@/lib/locapass/publicUrls";

// 旧UUID直リンク(/shops/[UUID]/reels)。slugベースの新URLへ301相当で送る。
export default async function LegacyShopReelsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { shopId } = await params;
  const { start } = await searchParams;
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

  const query = start ? `?start=${encodeURIComponent(start)}` : "";
  permanentRedirect(`${shopReelsPath(portal.slug, shop.slug)}${query}`);
}
