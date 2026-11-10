import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttributeShopGrid } from "@/components/shop/AttributeShopGrid";
import { ATTRIBUTES, isAttributeKey, type AttributeField, type AttributeKey } from "@/lib/verticals/attributes";
import { getShopsByAttribute } from "@/lib/verticals/getShopsByAttribute";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { localizedPageUrls } from "@/lib/i18n/metadata";
import { MIN_SHOPS_FOR_ATTRIBUTE_PAGE } from "@/lib/seo/attributePages";
import { JsonLd } from "@/components/JsonLd";
import { shopPath } from "@/lib/locapass/publicUrls";

export const revalidate = 60;

type Params = { params: Promise<{ attr: string }>; searchParams: Promise<{ v?: string }> };

/** ?v=ramen のように、選択肢(料理など)で絞る指定。定義にある選択肢だけ受け付ける。 */
function resolveChoice(attr: AttributeKey, v: string | undefined, locale: "ja" | "en" | "zh" | "ar") {
  if (!v) return null;
  const field = (ATTRIBUTES[attr].fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  if (!field || field.kind !== "multi") return null;
  const option = field.options.find((o) => o.value === v);
  return option ? { field: field.key, value: option.value, label: option.label[locale] } : null;
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { attr } = await params;
  if (!isAttributeKey(attr)) return {};
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  const choice = resolveChoice(attr, (await searchParams).v, locale);
  const shops = await getShopsByAttribute(attr, choice ?? undefined);
  const name = choice?.label ?? def.label[locale];
  const title = locale === "ja" ? `${def.icon} ${name}のお店 ${shops.length}軒 | LOCAPASS` : `${def.icon} ${name} (${shops.length}) | LOCAPASS`;
  const description = locale === "ja"
    ? `「${name}」のお店を、動画(リール)で雰囲気を見ながら探せます。LOCAPASSに掲載中の${shops.length}軒。`
    : `Find places tagged "${name}" and preview them with short videos on LOCAPASS (${shops.length} listed).`;
  return {
    title,
    description,
    // 絞り込み(?v=)のページは別URLとして評価されないよう、正規URLは属性ページ本体に寄せる。
    alternates: (await localizedPageUrls(`/tag/${attr}`)).alternates,
    // 店舗が少ない属性・絞り込みページは中身が薄いので、検索結果には出さない(サイトマップにも載せていない)。
    ...(choice || shops.length < MIN_SHOPS_FOR_ATTRIBUTE_PAGE ? { robots: { index: false, follow: true } } : {}),
  };
}

/** 店舗ページの属性チップ(ペット同伴可・子連れ歓迎など)をタップしたときの、その属性の店舗一覧。 */
export default async function AttributeShopsPage({ params, searchParams }: Params) {
  const { attr } = await params;
  if (!isAttributeKey(attr)) notFound();
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  const choice = resolveChoice(attr, (await searchParams).v, locale);
  const shops = await getShopsByAttribute(attr, choice ?? undefined);
  const itemList = !choice && shops.length >= MIN_SHOPS_FOR_ATTRIBUTE_PAGE ? {
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
      <AttributeShopGrid icon={def.icon} label={choice?.label ?? def.label[locale]} shops={shops} />
    </>
  );
}
