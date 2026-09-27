import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { castPath } from "@/lib/locapass/publicUrls";

// インスタのプロフィール欄などに貼るための短縮URL(/c/AB12CD)。
// 6桁の短いコード(cast_code)から、slugベースの公開プロフィール
// (/{portalSlug}/cast/{shopSlug}-{発行番号})へ飛ばす。
export default async function CastShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: cast } = await supabase
    .from("locapass_public_casts")
    .select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )")
    .eq("cast_code", code.toUpperCase())
    .maybeSingle();

  const shop = Array.isArray(cast?.shop) ? cast.shop[0] : cast?.shop;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;

  if (!cast || !shop || !portal) {
    notFound();
  }

  redirect(castPath(portal.slug, shop.slug, cast.issue_no));
}
