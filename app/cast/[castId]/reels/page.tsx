import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { castReelsPath } from "@/lib/locapass/publicUrls";

// 旧UUID直リンク(/cast/[UUID]/reels)。slugベースの新URLへ301相当で送る。
export default async function LegacyCastReelsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ castId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { castId } = await params;
  const { start } = await searchParams;
  const supabase = await createClient();

  const { data: cast } = await supabase
    .from("locapass_public_casts")
    .select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )")
    .eq("id", castId)
    .maybeSingle();

  const shop = Array.isArray(cast?.shop) ? cast.shop[0] : cast?.shop;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;

  if (!cast || !shop || !portal) {
    notFound();
  }

  const query = start ? `?start=${encodeURIComponent(start)}` : "";
  permanentRedirect(`${castReelsPath(portal.slug, shop.slug, cast.issue_no)}${query}`);
}
