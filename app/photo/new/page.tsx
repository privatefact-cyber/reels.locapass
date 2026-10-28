import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";
import { PhotoComposer, type PhotoComposerPreset } from "@/components/photo/PhotoComposer";
import { resolveShopVenueIds } from "@/lib/photo/getShopPhotoPosts";
import { shopPhotosPath } from "@/lib/locapass/publicUrls";
import { photoText } from "@/lib/photo/serverText";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await photoText();
  return { title: t.composeTitle, robots: { index: false } };
}

export default async function NewPhotoPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { shop: shopParam } = await searchParams;
  const shopId = shopParam && /^[0-9a-f-]{36}$/i.test(shopParam) ? shopParam : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const selfPath = shopId ? `/photo/new?shop=${shopId}` : "/photo/new";
  if (!user) redirect(`/mypage/login?redirect=${encodeURIComponent(selfPath)}`);

  const canOperator = hasManagementRole(await fetchMyRoles(supabase));

  // 店舗ページから来たときは、その店(掲載店)を選択済みにして開く。対応する掲載店が見つからなければ通常の投稿画面。
  let preset: PhotoComposerPreset | undefined;
  if (shopId) {
    const { data: shop } = await supabase
      .from("locapass_shops")
      .select("name, slug, address, venue_id, lat, lng, portal:locapass_portals ( slug )")
      .eq("id", shopId)
      .eq("status", "active")
      .maybeSingle();
    if (shop) {
      const [venueId] = shop.venue_id
        ? [shop.venue_id]
        : await resolveShopVenueIds({ name: shop.name, venueId: null, lat: shop.lat, lng: shop.lng });
      const portal = Array.isArray(shop.portal) ? shop.portal[0] : shop.portal;
      // 位置が登録されている店なら「この店の写真」として固定する(ピンも店の位置)。位置が無い店は従来どおりの選択式。
      const lockToShop = shop.lat != null && shop.lng != null;
      if (venueId || lockToShop) {
        preset = {
          venueId: venueId ?? null,
          name: shop.name,
          address: shop.address,
          ...(lockToShop && shop.lat != null && shop.lng != null
            ? {
                shopId,
                lat: shop.lat,
                lng: shop.lng,
                backHref: portal ? shopPhotosPath(portal.slug, shop.slug) : undefined,
              }
            : {}),
        };
      }
    }
  }
  return <PhotoComposer canOperator={canOperator} preset={preset} />;
}
