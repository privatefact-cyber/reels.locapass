import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { docsFor } from "@/lib/support/docs";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { SupportCenter } from "@/components/support/SupportCenter";

export const dynamic = "force-dynamic";

/** 店舗管理者向けの使い方(AI+ガイド)。管理画面の中だけにあり、一般のサポートページとは別。 */
export default async function ShopSupportPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const locale = await getServerLocale();
  const docs = docsFor(["shop"], locale).map(({ id, audience, title, body }) => ({ id, audience, title, body }));
  return (
    <div className="rounded-2xl bg-black py-1">
      <SupportCenter docs={docs} audience="shop" />
    </div>
  );
}
