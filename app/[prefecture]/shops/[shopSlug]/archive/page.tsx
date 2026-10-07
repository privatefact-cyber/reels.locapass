import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";
import { archiveThumbFromMedia } from "@/lib/reels/archiveThumb";
import { shopPath, shopReelsPath, shopArchivePath } from "@/lib/locapass/publicUrls";
import { ShopReelArchive, type ArchiveItem } from "@/components/shop/ShopReelArchive";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";

export const revalidate = 60;

type PageParams = { prefecture: string; shopSlug: string };

export const metadata: Metadata = {
  title: "動画ストック - LOCAPASS",
  // 一覧の派生ページなので検索結果には出さない(店舗ページ本体を正とする)。
  robots: { index: false, follow: true },
};

export default async function ShopReelArchivePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { prefecture, shopSlug } = await params;
  const supabase = await createClient();

  const { data: portal } = await supabase
    .from("locapass_portals")
    .select("id, slug, theme")
    .eq("slug", prefecture)
    .maybeSingle();
  if (!portal) notFound();

  const { data: shop, error: shopError } = await supabase
    .from("locapass_shops")
    .select("id, slug, name")
    .eq("portal_id", portal.id)
    .eq("slug", shopSlug)
    .maybeSingle();
  if (shopError && shopError.code !== "PGRST116") {
    throw new Error(`locapass_shops取得に失敗しました: ${shopError.message}`);
  }
  if (!shop) notFound();

  // 店舗ページ本体の動画帯は直近のみ。ここでは公開中の全リール(ストーリーは除く)を軽量な列だけで取る。
  const { data: reelRows, error: reelError } = await supabase
    .from("locapass_reels")
    .select(
      `id, ${LOCAPASS_REEL_MEDIA_SELECT}, published_at, updated_at, author_name, tags, cast_members:locapass_public_casts ( name ), staff_members:locapass_shop_staff_members ( name )`,
    )
    .eq("shop_id", shop.id)
    .eq("status", "publish")
    .eq("reel_type", "permanent")
    .order("published_at", { ascending: false })
    .limit(1000);
  if (reelError) {
    throw new Error(`locapass_reels取得に失敗しました: ${reelError.message}`);
  }

  const items: ArchiveItem[] = [];
  for (const row of reelRows ?? []) {
    const media = toReelMedia(row)[0];
    const at = row.published_at ?? row.updated_at;
    if (!media || !at) continue;
    const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
    const staff = Array.isArray(row.staff_members) ? row.staff_members[0] : row.staff_members;

    const { thumbUrl, videoUrl } = archiveThumbFromMedia(media);

    items.push({
      id: row.id,
      at,
      thumbUrl,
      videoUrl,
      isVideo: media.type === "video",
      author: cast?.name ?? staff?.name ?? row.author_name ?? shop.name,
      tags: row.tags ?? [],
    });
  }

  return (
    <div className="pb-32">
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <ShopReelArchive
        items={items}
        shopName={shop.name}
        shopHref={shopPath(portal.slug, shop.slug)}
        reelsHref={shopReelsPath(portal.slug, shop.slug)}
        archiveHref={shopArchivePath(portal.slug, shop.slug)}
        trackShopId={shop.id}
      />
    </div>
  );
}
