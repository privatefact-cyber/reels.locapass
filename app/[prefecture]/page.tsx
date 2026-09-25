import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { getPortalFeedData } from "@/lib/reels/getPortalFeedData";
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
    .select("id, name, tagline, description, hero_media_type, hero_media_url, hero_link_url, theme")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export default async function AreaPortalPage({ params }: { params: Promise<PageParams> }) {
  const { prefecture: slug } = await params;
  const portal = await resolvePortal(slug);
  if (!portal) notFound();

  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);
  const { reels, shopItems, genreChoices, ads } = await getPortalFeedData(portal.id);
  const nowReels: ReelItem[] = [];

  return (
    <div id="portal-feed" className="space-y-4">
      {/* このポータルで選んだ配色テーマ(未設定ならサイト全体の配色) */}
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <PortalHero
        name={portal.name}
        tagline={portal.tagline}
        description={portal.description}
        heroMediaType={portal.hero_media_type}
        heroMediaUrl={portal.hero_media_url}
        heroLinkUrl={portal.hero_link_url}
      />
      <FeaturedSection shops={featuredShops} />
      <ReelFeed reels={reels} nowReels={nowReels} shops={shopItems} genreChoices={genreChoices} ads={ads} />
    </div>
  );
}
