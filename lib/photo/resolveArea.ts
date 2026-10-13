import { createAdminClient } from "@/lib/supabase/admin";

const AREA_RADIUS_M = 30000;
const VENUE_LINK_RADIUS_M = 150;

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * 写真の位置から、(1)一番近い掲載店のエリア(30km以内、無ければ'other')と、
 * (2)150m以内の一番近い掲載店(自動紐付け)を返す。親ポータル(locapass)は全店の複製を持つので除外する。
 */
export async function resolveAreaAndVenue(lat: number, lng: number): Promise<{ site: string; venueId: string | null }> {
  const admin = createAdminClient();
  const [{ data: portals }, { data: venues }] = await Promise.all([
    admin.from("locapass_portals").select("id,slug"),
    admin.from("locapass_venues").select("id,portal_id,lat,lng").eq("status", "publish").not("lat", "is", null).not("lng", "is", null).limit(5000),
  ]);
  const slugById = new Map((portals ?? []).filter((p) => p.slug !== "locapass").map((p) => [p.id, p.slug]));

  let bestSite = "other";
  let bestAreaM = AREA_RADIUS_M;
  let venueId: string | null = null;
  let bestVenueM = VENUE_LINK_RADIUS_M;
  for (const v of venues ?? []) {
    const slug = slugById.get(v.portal_id as number);
    if (!slug || v.lat == null || v.lng == null) continue;
    const d = distanceM(lat, lng, v.lat, v.lng);
    if (d < bestAreaM) {
      bestAreaM = d;
      bestSite = slug;
    }
    if (d < bestVenueM) {
      bestVenueM = d;
      venueId = v.id;
    }
  }
  return { site: bestSite, venueId };
}
