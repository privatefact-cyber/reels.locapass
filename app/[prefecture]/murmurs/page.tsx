import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";
import { MURMUR_PAGE_SIZE } from "@/lib/murmur/config";
import { murmurLabels } from "@/lib/murmur/labels";
import { listPortalMurmurs } from "@/lib/murmur/queries";
import { MurmurList } from "@/components/murmur/MurmurList";
import { MurmurPager } from "@/components/murmur/MurmurPager";

type PageParams = { prefecture: string };

/** ロカパス全体(グランドトップ)は、全ポータルの投稿を混ぜて出す。それ以外は、そのポータルの店だけ。 */
const HUB_SLUG = "locapass";

async function loadPortal(prefecture: string) {
  const supabase = await createClient();
  const { data: portal } = await supabase.from("locapass_portals").select("id, slug, name, theme").eq("slug", prefecture).maybeSingle();
  return portal ? { supabase, portal } : null;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { prefecture } = await params;
  const ctx = await loadPortal(prefecture);
  if (!ctx) return {};
  const t = murmurLabels(await getServerLocale());
  return { title: `${t.timelineTitle} - ${ctx.portal.name}`, description: t.timelineLead };
}

/** 「みんなのひとこと」: ポータルごとのタイムライン(新しい順)。 */
export default async function PortalMurmursPage({ params, searchParams }: { params: Promise<PageParams>; searchParams: Promise<{ page?: string }> }) {
  const { prefecture } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const ctx = await loadPortal(prefecture);
  if (!ctx) notFound();
  const locale = await getServerLocale();
  const t = murmurLabels(locale);
  const { items, total } = await listPortalMurmurs(ctx.supabase as never, ctx.portal.slug === HUB_SLUG ? null : ctx.portal.id, page);
  if (page > 1 && items.length === 0) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6 sm:px-6">
      <PortalThemeScope theme={isSiteTheme(ctx.portal.theme) ? ctx.portal.theme : null} />
      <Link href={`/${ctx.portal.slug}`} className="inline-flex items-center gap-1 text-sm text-tone-400">
        <ChevronLeft size={16} /> {t.backToPortal}
      </Link>
      <h1 className="font-display mt-3 text-2xl font-semibold text-main">{t.timelineTitle}</h1>
      <p className="mt-1 text-sm text-tone-400">{t.timelineLead}</p>
      <div className="mt-5">
        <MurmurList items={items} locale={locale} />
        <MurmurPager basePath={`/${ctx.portal.slug}/murmurs`} page={page} total={total} pageSize={MURMUR_PAGE_SIZE} locale={locale} />
      </div>
    </div>
  );
}
