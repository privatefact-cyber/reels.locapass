import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { getShopPhotoAdminView } from "@/lib/photo/getShopPhotoPosts";
import { PhotoWallSettings } from "@/components/locapass-dashboard/PhotoWallSettings";
import { resolvePreset } from "@/lib/photowall/presets";
import { ShopPhotoLinkManager } from "@/components/locapass-dashboard/ShopPhotoLinkManager";

/**
 * 店舗ページの「ユーザーPHOTO」の管理。自動で紐付いた写真が違う店の写真だったときは「出さない」にでき、
 * 紐付かなかった写真は(ポータル管理者以上が)「この店舗に表示する」で追加できる。
 */
export default async function LocapassShopPhotosAdminPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, name, venue_id, lat, lng, locapass_portals(slug)")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) notFound();
  // 背景「写真の壁」の設定(型に無い列なので別に読む)。
  const { data: wall } = await (supabase as any)
    .from("locapass_shops")
    .select("category, photo_wall_enabled, photo_wall_preset")
    .eq("id", shopId)
    .maybeSingle();
  const portal = Array.isArray((shop as any).locapass_portals) ? (shop as any).locapass_portals[0] : (shop as any).locapass_portals;

  const view = await getShopPhotoAdminView(
    { id: shop.id, name: shop.name, venueId: shop.venue_id, lat: shop.lat, lng: shop.lng },
    viewer.isOperator ? (portal?.slug ?? null) : null,
  );

  const slim = (p: (typeof view.shown)[number]) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    spotName: p.spotName,
    userName: p.userName,
    createdAt: p.createdAt,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">写真の管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          店舗ページの「LOCA SNAP」に出る写真を管理します。違う店の写真が出ているときは「この店舗では出さない」にできます。
          写真そのものは消えず、LOCA SNAP の一覧には残ります。
        </p>
      </div>
      <PhotoWallSettings
        shopId={shop.id}
        initialEnabled={Boolean(wall?.photo_wall_enabled)}
        initialPreset={wall?.photo_wall_preset ?? null}
        defaultPreset={resolvePreset(null, wall?.category)}
      />
      <ShopPhotoLinkManager
        shopId={shop.id}
        canAttach={viewer.isOperator}
        shown={view.shown.map((p) => ({ ...slim(p), attached: view.attachedIds.includes(p.id) }))}
        hidden={view.hidden.map(slim)}
        candidates={view.candidates.map(slim)}
      />
    </div>
  );
}
