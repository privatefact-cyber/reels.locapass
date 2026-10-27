import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { ShopItemsManager } from "@/components/locapass-dashboard/ShopItemsManager";
import { ITEM_COLUMNS, type ShopItem } from "@/lib/shop/items";

export const dynamic = "force-dynamic";

export default async function ShopItemsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = (await createClient()) as any;
  const { data: portal } = await supabase.from("locapass_portals").select("features").eq("id", viewer.shop.portal_id).maybeSingle();
  if (!(portal?.features ?? []).includes("items")) notFound();

  // 車のページのURLの共通部分(リールのリンク先に貼るため)。
  const { data: shopRow } = await supabase.from("locapass_shops").select("slug, locapass_portals ( slug )").eq("id", shopId).maybeSingle();
  const itemBaseUrl = `https://locapass.net/${shopRow?.locapass_portals?.slug ?? ""}/shops/${shopRow?.slug ?? ""}/items`;

  const { data } = await supabase
    .from("locapass_shop_items")
    .select(ITEM_COLUMNS)
    .eq("shop_id", shopId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">在庫(車両)</h1>
      <ShopItemsManager shopId={shopId} items={(data ?? []) as ShopItem[]} itemBaseUrl={itemBaseUrl} />
    </div>
  );
}
