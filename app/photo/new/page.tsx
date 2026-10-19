import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";
import { PhotoComposer, type PhotoComposerPreset } from "@/components/photo/PhotoComposer";
import { resolveShopVenueIds } from "@/lib/photo/getShopPhotoPosts";
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
      .select("name, address, venue_id, lat, lng")
      .eq("id", shopId)
      .eq("status", "active")
      .maybeSingle();
    if (shop) {
      const [venueId] = shop.venue_id
        ? [shop.venue_id]
        : await resolveShopVenueIds({ name: shop.name, venueId: null, lat: shop.lat, lng: shop.lng });
      if (venueId) preset = { venueId, name: shop.name, address: shop.address };
    }
  }
  return <PhotoComposer canOperator={canOperator} preset={preset} />;
}
