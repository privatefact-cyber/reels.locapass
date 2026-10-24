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
 * 店舗に対応する掲載店(locapass_venues)のIDの一覧。親ポータルが全店の複製を持つため、同じ店のvenueが複数ある。
 * 名前と座標が同じvenueを同じ店としてまとめる。店舗にvenue_idが無いときは、座標が近く名前が似たvenueで探す。
 */
export async function resolveShopVenueIds(shop: {
  name: string;
  venueId: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<string[]> {
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
  return venueIds;
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
  const venueIds = await resolveShopVenueIds(shop);
  const supabase = createStaticClient();

  const rows: PostRow[] = [];
  if (venueIds.length > 0) {
    const { data, error } = await supabase
      .from("area_photo_posts")
      .select(POST_COLUMNS)
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false })
      .limit(limit * 3);
    if (error) throw error;
    rows.push(...((data ?? []) as PostRow[]));
  }

  // 店舗に掲載店(venue)が結び付いていない/別の掲載店に紐付いてしまった投稿も拾う。
  // 投稿時の自動紐付けは「近くの別の掲載店」になることがあるので、店舗の近く(約150m)で、
  // 場所名がこの店の名前に似ている投稿だけを、掲載店に関係なく対象にする。
  if (shop.lat != null && shop.lng != null) {
    const d = 0.0015;
    const { data: nearby, error: nearErr } = await supabase
      .from("area_photo_posts")
      .select(POST_COLUMNS)
      .gte("latitude", shop.lat - d)
      .lte("latitude", shop.lat + d)
      .gte("longitude", shop.lng - d)
      .lte("longitude", shop.lng + d)
      .order("created_at", { ascending: false })
      .limit(limit * 3);
    if (nearErr) throw nearErr;
    for (const r of (nearby ?? []) as PostRow[]) {
      if (nameLike(r.spot_name, shop.name) || nameLike(r.place_name, shop.name)) rows.push(r);
    }
  }
  if (rows.length === 0) return [];

  const seen = new Set<string>();
  const kept = rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .filter((r) => r.place_kind === "listed" || nameLike(r.spot_name, shop.name) || nameLike(r.place_name, shop.name))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
  return toPosts(supabase, kept);
}
