import { createStaticClient } from "@/lib/supabase/static";
import { POST_COLUMNS, toPosts, type PhotoPost, type PostRow } from "@/lib/photo/getPhotoPosts";

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_()（）「」【】&＆×x.,'’"]/g, "");

function nameLike(a: string | null | undefined, b: string) {
  if (!a) return false;
  const x = norm(a);
  const y = norm(b);
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
}

/**
 * その店舗に紐付く、訪問者の投稿写真(エリアフォト)。
 * 写真は「掲載店(locapass_venues)」に紐付く。親ポータルが全店の複製を持つため、同じ店のvenueが複数あるので
 * 名前と座標が同じvenueを「同じ店」としてまとめて探す。店舗にvenue_idが無いときは、座標が近く名前が似たvenueで探す。
 *
 * 投稿時の自動紐付けは「150m以内で一番近い掲載店」なので、手入力の場所名が別の店でも近いだけで紐付くことがある。
 * 店舗ページで他店の写真が混ざらないよう、(1)投稿者が掲載店として選んだ写真か、(2)場所名がこの店の名前に似ている写真だけを出す。
 */
export async function getShopPhotoPosts(
  shop: { name: string; venueId: string | null; lat: number | null; lng: number | null },
  limit = 90,
): Promise<PhotoPost[]> {
  const supabase = createStaticClient();

  let venueIds: string[] = [];
  if (shop.venueId) {
    const { data: v } = await supabase.from("locapass_venues").select("name, lat, lng").eq("id", shop.venueId).maybeSingle();
    venueIds = [shop.venueId];
    if (v?.lat != null && v?.lng != null) {
      const { data: siblings } = await supabase
        .from("locapass_venues")
        .select("id")
        .eq("name", v.name)
        .eq("lat", v.lat)
        .eq("lng", v.lng);
      venueIds = Array.from(new Set([shop.venueId, ...(siblings ?? []).map((s) => s.id)]));
    }
  } else if (shop.lat != null && shop.lng != null) {
    const d = 0.0003; // 約30m
    const { data: near } = await supabase
      .from("locapass_venues")
      .select("id, name")
      .gte("lat", shop.lat - d)
      .lte("lat", shop.lat + d)
      .gte("lng", shop.lng - d)
      .lte("lng", shop.lng + d);
    venueIds = (near ?? []).filter((v) => nameLike(v.name, shop.name)).map((v) => v.id);
  }
  if (venueIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("area_photo_posts")
    .select(POST_COLUMNS)
    .in("venue_id", venueIds)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (error) throw error;

  const kept = ((rows ?? []) as PostRow[])
    .filter((r) => r.place_kind === "listed" || nameLike(r.spot_name, shop.name) || nameLike(r.place_name, shop.name))
    .slice(0, limit);
  return toPosts(supabase, kept);
}
