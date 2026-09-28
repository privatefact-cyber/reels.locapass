import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { castPath } from "@/lib/locapass/publicUrls";

// 旧UUID直リンク(/cast/[UUID])。過去に配布・インデックス済みのURLを生かすため、
// slugベースの新URL(/{portalSlug}/cast/{shopSlug}-{発行番号})へ301相当で送る。
export default async function LegacyCastDetailRedirect({
  params,
}: {
  params: Promise<{ castId: string }>;
}) {
  const { castId } = await params;
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

  permanentRedirect(castPath(portal.slug, shop.slug, cast.issue_no!));
}
