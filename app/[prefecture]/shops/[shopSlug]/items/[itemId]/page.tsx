import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { localizeItem } from "@/lib/shop/itemLocalize";
import { ITEM_COLUMNS, formatItemPrice, itemsPath, statusBadge, vehicleSpecs, type ShopItem } from "@/lib/shop/items";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { isSiteTheme } from "@/lib/theme";

export const revalidate = 60;

type PageParams = { prefecture: string; shopSlug: string; itemId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load({ prefecture, shopSlug, itemId }: PageParams) {
  if (!UUID_RE.test(itemId)) return null;
  const supabase = (await createClient()) as any;
  const { data: portal } = await supabase.from("locapass_portals").select("id, slug, theme").eq("slug", prefecture).maybeSingle();
  if (!portal) return null;
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, slug, name, tel, url")
    .eq("portal_id", portal.id)
    .eq("slug", shopSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!shop) return null;
  const { data: item } = await supabase.from("locapass_shop_items").select(ITEM_COLUMNS).eq("id", itemId).eq("shop_id", shop.id).maybeSingle();
  if (!item) return null;
  const locale = await getServerLocale();
  return { portal, shop, locale, item: localizeItem(item as ShopItem, locale) };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const found = await load(await params);
  if (!found) return { title: "LOCAPASS" };
  return {
    title: `${found.item.title}|${found.shop.name} - LOCAPASS`,
    description: formatItemPrice(found.item, found.locale, dictionaries[found.locale].items),
    robots: { index: false, follow: true },
  };
}

export default async function ShopItemDetailPage({ params }: { params: Promise<PageParams> }) {
  const found = await load(await params);
  if (!found) notFound();
  const { portal, shop, item, locale } = found;
  const t = dictionaries[locale].items;
  const specs = vehicleSpecs(item.attributes, locale, t);
  const badge = statusBadge(item.status, t);

  return (
    <div className="space-y-5 pb-32">
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <div className="px-3 pt-4">
        <Link href={itemsPath(portal.slug, shop.slug)} className="flex items-center gap-1 text-sm text-tone-300 hover:text-main">
          <ChevronLeft size={16} />
          <span className="truncate">{t.backToList(shop.name)}</span>
        </Link>
      </div>

      {item.image_urls.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3">
          {item.image_urls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={`${item.title} ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="aspect-[4/3] w-[88%] shrink-0 snap-center rounded-2xl object-cover sm:w-[60%]" />
          ))}
        </div>
      )}

      <div className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          {badge && <span className="rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-bold text-main">{badge}</span>}
        </div>
        <h1 className="font-display text-xl font-bold text-main">{item.title}</h1>
        <p className="text-2xl font-bold text-hl-300">{formatItemPrice(item, locale, t)}</p>

        {specs.length > 0 && (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line/20 bg-line/20 text-sm">
            {specs.map((s) => (
              <div key={s.label} className="bg-panel-900/80 px-3 py-2">
                <dt className="text-[11px] text-tone-500">{s.label}</dt>
                <dd className="font-semibold text-main">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {item.description && <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-tone-300">{item.description}</p>}

        <div className="space-y-2 pt-2">
          {shop.tel && (
            <a href={`tel:${shop.tel}`} className="flex items-center justify-center gap-2 rounded-full bg-cta-light px-4 py-3 text-sm font-bold text-on-cta-gold transition hover:bg-cta-hover">
              <Phone size={16} />
              {t.callShop(shop.name)}
            </a>
          )}
          {shop.url && (
            <a href={shop.url} target="_blank" rel="noopener noreferrer" className="block rounded-full border border-line/30 px-4 py-2.5 text-center text-xs font-semibold text-tone-300 hover:text-main">
              {t.officialSite}
            </a>
          )}
        </div>
        <p className="text-[11px] text-tone-500">{t.disclaimer}</p>
      </div>
    </div>
  );
}
