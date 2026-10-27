import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { shopPath } from "@/lib/locapass/publicUrls";
import { localizeItem } from "@/lib/shop/itemLocalize";
import { ITEM_COLUMNS, itemPath, type ShopItem } from "@/lib/shop/items";
import { ITEM_GRID_CLASS, ShopItemCard } from "@/components/shop/ShopItemCard";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";

export const revalidate = 60;

type PageParams = { prefecture: string; shopSlug: string };

export const metadata: Metadata = {
  title: "在庫車両 - LOCAPASS",
  // 店舗ページ本体を正とする。
  robots: { index: false, follow: true },
};

export default async function ShopItemsListPage({ params }: { params: Promise<PageParams> }) {
  const { prefecture, shopSlug } = await params;
  const supabase = (await createClient()) as any;
  const locale = await getServerLocale();
  const t = dictionaries[locale].items;

  const { data: portal } = await supabase.from("locapass_portals").select("id, slug, theme").eq("slug", prefecture).maybeSingle();
  if (!portal) notFound();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, slug, name, url")
    .eq("portal_id", portal.id)
    .eq("slug", shopSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!shop) notFound();

  const { data } = await supabase
    .from("locapass_shop_items")
    .select(ITEM_COLUMNS)
    .eq("shop_id", shop.id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const items = ((data ?? []) as ShopItem[]).map((i) => localizeItem(i, locale));
  // 販売中・商談中を先に、売約済みは最後にまとめる(並びはそれぞれ店舗が決めた順)。
  const sorted = [...items.filter((i) => i.status !== "sold"), ...items.filter((i) => i.status === "sold")];

  return (
    <div className="space-y-4 pb-32">
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <div className="px-3 pt-4">
        <Link href={shopPath(portal.slug, shop.slug)} className="flex items-center gap-1 text-sm text-tone-300 hover:text-main">
          <ChevronLeft size={16} />
          <span className="truncate">{shop.name}</span>
        </Link>
      </div>
      <div className="px-3 text-center">
        <h1 className="font-display text-xl font-bold text-main">{t.title}</h1>
        <p className="mt-1 text-xs text-muted">{t.count(items.length)}</p>
      </div>
      {sorted.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-tone-500">{t.empty}</p>
      ) : (
        <div className={ITEM_GRID_CLASS}>
          {sorted.map((item) => (
            <ShopItemCard key={item.id} item={item} href={itemPath(portal.slug, shop.slug, item.id)} locale={locale} t={t} />
          ))}
        </div>
      )}
      {shop.url && (
        <div className="px-3">
          <a href={shop.url} target="_blank" rel="noopener noreferrer" className="block rounded-full border border-line/30 px-4 py-2 text-center text-xs font-semibold text-tone-300 hover:text-main">
            {t.officialSite}
          </a>
        </div>
      )}
    </div>
  );
}
