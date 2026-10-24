import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { getNowReels } from "@/lib/reels/getNowReels";
import { getPortalFeedData } from "@/lib/reels/getPortalFeedData";
import Link from "next/link";
import { getActiveBoosts } from "@/lib/boost/getBoosts";
import { boostText } from "@/lib/boost/text";
import { PortalHero } from "@/components/portal/PortalHero";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";

// 注記: このディレクトリ名は[prefecture]だが、既存の/[prefecture]/[city]/[category]
// (LUXELA側のSEO用ルート、lib/seo/area.tsのPREFECTURE_SLUG="tokyo"固定)と同じNext.jsの
// ルートセグメントを再利用している。Next.jsは同じ階層に別名の動的セグメントを共存
// できない仕様のため、新たに[area]フォルダを追加せず既存の[prefecture]フォルダに
// このpage.tsxを追加する形にした。ここでのparams.prefectureの実体は
// locapass_portals.slug(例: "mito", "oarai")であり、都道府県ではない。
export const revalidate = 60;

type PageParams = { prefecture: string };

async function resolvePortal(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locapass_portals")
    .select("id, name, name_en, tagline, description, hero_media_type, hero_media_url, hero_link_url, theme")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export default async function AreaPortalPage({ params }: { params: Promise<PageParams> }) {
  const { prefecture: slug } = await params;
  const portal = await resolvePortal(slug);
  if (!portal) notFound();

  const { data: ytPortal } = await (await createClient() as any).from("locapass_portals").select("hero_youtube_id").eq("id", portal.id).maybeSingle();
  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);
  const { reels, shopItems, genreChoices, ads } = await getPortalFeedData(portal.id);
  const nowReels: ReelItem[] = await getNowReels(portal.id).catch(() => []);
  // このポータルの店舗の緊急ブーストだけ(失敗してもポータル全体は表示する)。
  const boosts = await getActiveBoosts(portal.id).catch(() => []);
  const bt = boostText(locale);

  return (
    <div id="portal-feed" className="space-y-4">
      {/* このポータルで選んだ配色テーマ(未設定ならサイト全体の配色) */}
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <PortalHero
        name={locale !== "ja" && portal.name_en ? portal.name_en : portal.name}
        tagline={portal.tagline}
        description={portal.description}
        heroMediaType={portal.hero_media_type}
        heroMediaUrl={portal.hero_media_url}
        heroLinkUrl={portal.hero_link_url}
        heroYoutubeId={ytPortal?.hero_youtube_id ?? null}
      />
      <FeaturedSection shops={featuredShops} />
      {boosts.length > 0 && (
        <Link
          href={`/${slug}/boost`}
          className="mx-2 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-black active:scale-[0.99]"
        >
          <span className="text-sm font-black">⚡ {bt.title}・{bt.limited}</span>
          <span className="rounded-full bg-black px-3 py-0.5 text-xs font-black text-amber-300">{boosts.length}</span>
        </Link>
      )}
      <ReelFeed reels={reels} nowReels={nowReels} shops={shopItems} genreChoices={genreChoices} ads={ads} boostCount={boosts.length} boostHref={`/${slug}/boost`} />
    </div>
  );
}
