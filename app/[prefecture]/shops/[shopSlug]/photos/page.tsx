import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { getShopPhotoPosts } from "@/lib/photo/getShopPhotoPosts";
import { shopPath } from "@/lib/locapass/publicUrls";
import { ShopUserPhotoGrid } from "@/components/shop/ShopUserPhotoGrid";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";

export const revalidate = 60;

type PageParams = { prefecture: string; shopSlug: string };

export const metadata: Metadata = {
  title: "ユーザーPHOTO - LOCAPASS",
  // 一覧の派生ページなので検索結果には出さない(店舗ページ本体を正とする)。
  robots: { index: false, follow: true },
};

export default async function ShopUserPhotosPage({ params }: { params: Promise<PageParams> }) {
  const { prefecture, shopSlug } = await params;
  const supabase = await createClient();
  const locale = await getServerLocale();
  const t = dictionaries[locale];

  const { data: portal } = await supabase.from("locapass_portals").select("id, slug, theme").eq("slug", prefecture).maybeSingle();
  if (!portal) notFound();

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, slug, name, venue_id, lat, lng")
    .eq("portal_id", portal.id)
    .eq("slug", shopSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!shop) notFound();

  const posts = await getShopPhotoPosts({ id: shop.id, name: shop.name, venueId: shop.venue_id, lat: shop.lat, lng: shop.lng });

  return (
    <div className="space-y-4 pb-32">
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <div className="flex items-center justify-between gap-3 px-3 pt-4">
        <Link href={shopPath(portal.slug, shop.slug)} className="flex items-center gap-1 text-sm text-tone-300 hover:text-main">
          <ChevronLeft size={16} />
          <span className="truncate">{shop.name}</span>
        </Link>
        <Link
          href={`/photo/new?shop=${shop.id}`}
          className="shrink-0 rounded-full bg-cta-light px-3 py-1 text-[11px] font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
        >
          {t.photo.postButton}
        </Link>
      </div>
      <div className="px-3 text-center">
        <h1 className="font-display text-xl font-bold text-main">{t.shop.userPhotosTitle}</h1>
        <p className="mt-1 text-xs text-muted">{t.shop.userPhotosCount(posts.length)}</p>
      </div>
      {posts.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-tone-500">{t.shop.userPhotosEmpty}</p>
      ) : (
        <ShopUserPhotoGrid posts={posts} layout="grid" shareUrl={`/${portal.slug}/shops/${shop.slug}/photos`} />
      )}
    </div>
  );
}
