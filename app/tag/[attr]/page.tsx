import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttributeShopGrid } from "@/components/shop/AttributeShopGrid";
import { ATTRIBUTES, isAttributeKey } from "@/lib/verticals/attributes";
import { getShopsByAttribute } from "@/lib/verticals/getShopsByAttribute";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { localizedPageUrls } from "@/lib/i18n/metadata";

export const revalidate = 60;

type Params = { params: Promise<{ attr: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { attr } = await params;
  if (!isAttributeKey(attr)) return {};
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  return { title: `${def.icon} ${def.label[locale]}`, alternates: (await localizedPageUrls(`/tag/${attr}`)).alternates };
}

/** 店舗ページの属性チップ(ペット同伴可・子連れ歓迎など)をタップしたときの、その属性の店舗一覧。 */
export default async function AttributeShopsPage({ params }: Params) {
  const { attr } = await params;
  if (!isAttributeKey(attr)) notFound();
  const locale = await getServerLocale();
  const def = ATTRIBUTES[attr];
  const shops = await getShopsByAttribute(attr);
  return <AttributeShopGrid icon={def.icon} label={def.label[locale]} shops={shops} />;
}
