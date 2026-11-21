import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { shopPath } from "@/lib/locapass/publicUrls";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";
import { MURMUR_PAGE_SIZE } from "@/lib/murmur/config";
import { murmurLabels } from "@/lib/murmur/labels";
import { listShopMurmurs } from "@/lib/murmur/queries";
import { MurmurList } from "@/components/murmur/MurmurList";
import { getDeletableMurmurIds } from "@/lib/murmur/deletable";
import { TimelineComposer } from "@/components/murmur/TimelineComposer";
import { getComposerShops } from "@/lib/murmur/composerShops";
import { MurmurPager } from "@/components/murmur/MurmurPager";

type PageParams = { prefecture: string; shopSlug: string };

async function load(prefecture: string, shopSlug: string) {
  const supabase = await createClient();
  const { data: portal } = await supabase.from("locapass_portals").select("id, slug, theme").eq("slug", prefecture).maybeSingle();
  if (!portal) return null;
  const { data: shop } = await supabase.from("locapass_shops").select("id, slug, name").eq("portal_id", portal.id).eq("slug", shopSlug).maybeSingle();
  if (!shop) return null;
  return { supabase, portal, shop };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { prefecture, shopSlug } = await params;
  const ctx = await load(prefecture, shopSlug);
  if (!ctx) return {};
  const t = murmurLabels(await getServerLocale());
  return { title: `${t.archiveTitle(ctx.shop.name)} - LOCAPASS` };
}

/** 店ごとの「ひとこと一覧」。過去の投稿が消えずに残る、中身が日々増えていくページ。 */
export default async function ShopMurmursPage({ params, searchParams }: { params: Promise<PageParams>; searchParams: Promise<{ page?: string }> }) {
  const { prefecture, shopSlug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const ctx = await load(prefecture, shopSlug);
  if (!ctx) notFound();
  const locale = await getServerLocale();
  const t = murmurLabels(locale);
  const { items, total } = await listShopMurmurs(ctx.supabase as never, ctx.shop.id, page);
  if (page > 1 && items.length === 0) notFound();
  const deletableIds = await getDeletableMurmurIds(items);
  const composerShops = page === 1 ? await getComposerShops({ portalId: ctx.portal.id, shopId: ctx.shop.id }) : [];
  const base = `${shopPath(ctx.portal.slug, ctx.shop.slug)}/murmurs`;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6 sm:px-6">
      <PortalThemeScope theme={isSiteTheme(ctx.portal.theme) ? ctx.portal.theme : null} />
      <Link href={shopPath(ctx.portal.slug, ctx.shop.slug)} className="inline-flex items-center gap-1 text-sm text-tone-400">
        <ChevronLeft size={16} /> {t.backToShop}
      </Link>
      <h1 className="font-display mt-3 text-2xl font-semibold text-main"><bdi>{t.archiveTitle(ctx.shop.name)}</bdi></h1>
      <div className="mt-5 border-t border-tone-700/60">
        {composerShops.length > 0 && <TimelineComposer shops={composerShops} />}
        <MurmurList items={items} deletableIds={deletableIds} locale={locale} showShop={false} />
        <MurmurPager basePath={base} page={page} total={total} pageSize={MURMUR_PAGE_SIZE} locale={locale} />
      </div>
    </div>
  );
}
