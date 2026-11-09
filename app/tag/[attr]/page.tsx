import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttributeShopGrid } from "@/components/shop/AttributeShopGrid";
import { ATTRIBUTES, isAttributeKey } from "@/lib/verticals/attributes";
import { getShopsByAttribute } from "@/lib/verticals/getShopsByAttribute";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { localizedPageUrls } from "@/lib/i18n/metadata";
import { MIN_SHOPS_FOR_ATTRIBUTE_PAGE } from "@/lib/seo/attributePages";
import { JsonLd } from "@/components/JsonLd";
import { shopPath } from "@/lib/locapass/publicUrls";

export const revalidate = 60;

type Params = { params: Promise<{ attr: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { attr } = await params;
  if (!isAttributeKey(attr)) return {};
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  const shops = await getShopsByAttribute(attr);
  const title = locale === "ja" ? `${def.icon} ${def.label.ja}のお店 ${shops.length}軒 | LOCAPASS` : `${def.icon} ${def.label[locale]} (${shops.length}) | LOCAPASS`;
  const description = locale === "ja"
    ? `「${def.label.ja}」のお店を、動画(リール)で雰囲気を見ながら探せます。LOCAPASSに掲載中の${shops.length}軒。`
    : `Find places tagged "${def.label[locale]}" and preview them with short videos on LOCAPASS (${shops.length} listed).`;
  return {
    title,
    description,
    alternates: (await localizedPageUrls(`/tag/${attr}`)).alternates,
    // 店舗が少ない属性は中身が薄いので、検索結果には出さない(サイトマップにも載せていない)。
    ...(shops.length < MIN_SHOPS_FOR_ATTRIBUTE_PAGE ? { robots: { index: false, follow: true } } : {}),
  };
}

/** 店舗ページの属性チップ(ペット同伴可・子連れ歓迎など)をタップしたときの、その属性の店舗一覧。 */
export default async function AttributeShopsPage({ params }: Params) {
  const { attr } = await params;
  if (!isAttributeKey(attr)) notFound();
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  const shops = await getShopsByAttribute(attr);
  const itemList = shops.length >= MIN_SHOPS_FOR_ATTRIBUTE_PAGE ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: def.label[locale],
    numberOfItems: shops.length,
    itemListElement: shops.slice(0, 50).map((shop, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: shop.name,
      url: `https://locapass.net${shopPath(shop.portalSlug, shop.slug)}`,
    })),
  } : null;
  return (
    <>
      {itemList && <JsonLd data={itemList} />}
      <AttributeShopGrid icon={def.icon} label={def.label[locale]} shops={shops} />
    </>
  );
}
