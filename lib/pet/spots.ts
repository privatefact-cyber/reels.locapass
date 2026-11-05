import { createClient } from "@supabase/supabase-js";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { gridThumb } from "@/lib/images/thumb";
import { latestReelStillsByShop } from "@/lib/map/getVenues";
import { shopPath } from "@/lib/locapass/publicUrls";
import { PET_ATTRIBUTE_KEYS } from "@/lib/verticals/attributes";

/**
 * ワンコ手帳の「おでかけ」に出すお店。地図(/map の🐾)と同じ店舗データを使う。
 * - facility: ペット施設(ペット施設ポータル Lizand の店)
 * - with_pet: ペットと一緒に行ける店(属性「ペット同伴可」「ペット専用」が付いた店)
 * 種類(トリミング・病院など)の分類は持たない(2026-11-06 ユーザー判断)。
 */
export type PetSpot = {
  id: string;
  name: string;
  href: string;
  area: string | null;
  category: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  kinds: ("facility" | "with_pet")[];
};

const PET_FACILITY_PORTAL = "lizand";
const COLUMNS = "id, name, slug, area, category, address, lat, lng, icon_url, cover_url, portal:locapass_portals ( slug )";

type Row = { id: string; name: string; slug: string; area: string | null; category: string | null; address: string | null; lat: number | null; lng: number | null; icon_url: string | null; cover_url: string | null; portal: { slug: string } | { slug: string }[] | null };

function image(url: string | null): string | null {
  const safe = sanitizeImageUrl(url);
  // Googleの写真(place-photo)は使わない(Googleの有料APIは全面禁止)
  if (!safe || safe.includes("/api/place-photo/")) return null;
  return gridThumb(safe, 360) ?? null;
}

export async function getPetSpots(): Promise<PetSpot[]> {
  // 公開情報だけ(ログインに依存しない)。locapass_shop_attributes が型生成に無いので型なしで引く
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const [{ data: portal }, { data: attrs }] = await Promise.all([
    db.from("locapass_portals").select("id").eq("slug", PET_FACILITY_PORTAL).maybeSingle(),
    db.from("locapass_shop_attributes").select("shop_id").in("attribute_key", [...PET_ATTRIBUTE_KEYS]).limit(2000),
  ]);
  const withPetIds = new Set((attrs ?? []).map((a) => a.shop_id as string));

  const [facilityRes, withPetRes] = await Promise.all([
    portal?.id ? db.from("locapass_shops").select(COLUMNS).eq("status", "active").eq("portal_id", portal.id).limit(500) : Promise.resolve({ data: [] }),
    withPetIds.size ? db.from("locapass_shops").select(COLUMNS).eq("status", "active").in("id", [...withPetIds].slice(0, 500)) : Promise.resolve({ data: [] }),
  ]);

  const byId = new Map<string, { row: Row; kinds: Set<"facility" | "with_pet"> }>();
  for (const r of (facilityRes.data ?? []) as unknown as Row[]) byId.set(r.id, { row: r, kinds: new Set(["facility"]) });
  for (const r of (withPetRes.data ?? []) as unknown as Row[]) {
    const cur = byId.get(r.id);
    if (cur) cur.kinds.add("with_pet");
    else byId.set(r.id, { row: r, kinds: new Set(["with_pet"]) });
  }

  const spots: PetSpot[] = [];
  for (const { row, kinds } of byId.values()) {
    const p = Array.isArray(row.portal) ? row.portal[0] : row.portal;
    if (!p?.slug || !row.slug) continue;
    spots.push({
      id: row.id,
      name: row.name,
      href: shopPath(p.slug, row.slug),
      area: row.area,
      category: row.category,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      imageUrl: image(row.cover_url ?? row.icon_url),
      kinds: [...kinds],
    });
  }

  // 写真のない店は、最新リールの写真で補う(地図と同じ)
  const noPhoto = spots.filter((s) => !s.imageUrl).map((s) => s.id);
  if (noPhoto.length) {
    const stills = await latestReelStillsByShop(noPhoto);
    for (const s of spots) if (!s.imageUrl) s.imageUrl = image(stills.get(s.id) ?? null);
  }
  return spots;
}
