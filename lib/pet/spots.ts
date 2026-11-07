import { createClient } from "@supabase/supabase-js";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { gridThumb } from "@/lib/images/thumb";
import { latestReelStillsByShop } from "@/lib/map/getVenues";
import { shopPath } from "@/lib/locapass/publicUrls";
import { PET_ATTRIBUTE_KEYS } from "@/lib/verticals/attributes";

/**
 * ロカわんの「おでかけ」に出すお店。地図(/map の🐾)と同じ店舗データを使う。
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
  /** true = LOCAPASSに掲載中のお店(営業を確認済み=認証マーク)。false = OpenStreetMap等から取り込んだ施設 */
  verified?: boolean;
  /** 取り込んだ施設の種類(ドッグラン・動物病院など)。LOCAPASSのお店は null */
  placeCategory?: PetPlaceCategory | null;
};

export type PetPlaceCategory = "dog_run" | "vet" | "pet_shop" | "pet_hotel" | "trimming" | "training" | "other";
export const PLACE_CATEGORY_LABEL: Record<PetPlaceCategory, string> = {
  dog_run: "ドッグラン",
  vet: "動物病院",
  pet_shop: "ペットショップ",
  pet_hotel: "ペットホテル",
  trimming: "トリミング",
  training: "しつけ教室",
  other: "ペット施設",
};
export const PLACE_CATEGORY_EMOJI: Record<PetPlaceCategory, string> = { dog_run: "🐕", vet: "🏥", pet_shop: "🛍️", pet_hotel: "🏨", trimming: "✂️", training: "🎓", other: "🐾" };

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

export type SpotBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** 1回に返すお店の上限(施設が1000件を超えても、見えている範囲だけを返す) */
export const SPOTS_IN_VIEW_LIMIT = 300;

/**
 * 地図で見えている範囲のペット施設・一緒に行ける店(おでかけの全画面地図用)。
 * 範囲内の公開中の店を引き、ペット施設ポータルの店か🐾属性のある店だけを残す。範囲の中心から近い順に最大300件。
 */
export async function getPetSpotsInBounds(b: SpotBounds): Promise<{ spots: PetSpot[]; truncated: boolean }> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const [{ data: portal }, { data: rows }] = await Promise.all([
    db.from("locapass_portals").select("id").eq("slug", PET_FACILITY_PORTAL).maybeSingle(),
    db
      .from("locapass_shops")
      .select(`${COLUMNS}, portal_id`)
      .eq("status", "active")
      .gte("lat", b.minLat)
      .lte("lat", b.maxLat)
      .gte("lng", b.minLng)
      .lte("lng", b.maxLng)
      .limit(3000),
  ]);
  const list = (rows ?? []) as unknown as (Row & { portal_id: string })[];

  // 範囲内の店のうち、🐾属性(ペット同伴可・ペット専用)がある店(範囲内にお店がなければ、下の取り込んだ施設だけになる)
  const ids = list.map((r) => r.id);
  const withPet = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: attrs } = await db.from("locapass_shop_attributes").select("shop_id").in("attribute_key", [...PET_ATTRIBUTE_KEYS]).in("shop_id", ids.slice(i, i + 200));
    for (const a of attrs ?? []) withPet.add(a.shop_id as string);
  }

  const cLat = (b.minLat + b.maxLat) / 2;
  const cLng = (b.minLng + b.maxLng) / 2;
  const kept = list
    .map((r) => {
      const kinds: ("facility" | "with_pet")[] = [];
      if (portal?.id && r.portal_id === portal.id) kinds.push("facility");
      if (withPet.has(r.id)) kinds.push("with_pet");
      return { r, kinds };
    })
    .filter((x) => x.kinds.length > 0)
    .sort((a, z) => (a.r.lat! - cLat) ** 2 + (a.r.lng! - cLng) ** 2 - ((z.r.lat! - cLat) ** 2 + (z.r.lng! - cLng) ** 2));
  const truncated = kept.length > SPOTS_IN_VIEW_LIMIT;

  const spots: PetSpot[] = [];
  for (const { r, kinds } of kept.slice(0, SPOTS_IN_VIEW_LIMIT)) {
    const p = Array.isArray(r.portal) ? r.portal[0] : r.portal;
    if (!p?.slug || !r.slug) continue;
    spots.push({ id: r.id, name: r.name, href: shopPath(p.slug, r.slug), area: r.area, category: r.category, address: r.address, lat: r.lat, lng: r.lng, imageUrl: image(r.cover_url ?? r.icon_url), kinds, verified: true, placeCategory: null });
  }
  const noPhoto = spots.filter((s) => !s.imageUrl).map((s) => s.id);
  if (noPhoto.length) {
    const stills = await latestReelStillsByShop(noPhoto);
    for (const s of spots) if (!s.imageUrl) s.imageUrl = image(stills.get(s.id) ?? null);
  }

  // 取り込んだ施設(ドッグラン・動物病院など。LOCAPASSの地図には出さない)。中心から近い順に最大300件
  const { data: placeRows } = await db
    .from("locapass_pet_places")
    .select("id, category, name, address, lat, lng")
    .gte("lat", b.minLat)
    .lte("lat", b.maxLat)
    .gte("lng", b.minLng)
    .lte("lng", b.maxLng)
    .limit(3000);
  const places = ((placeRows ?? []) as { id: string; category: PetPlaceCategory; name: string; address: string | null; lat: number; lng: number }[])
    .sort((a, z) => (a.lat - cLat) ** 2 + (a.lng - cLng) ** 2 - ((z.lat - cLat) ** 2 + (z.lng - cLng) ** 2));
  const placeTruncated = places.length > SPOTS_IN_VIEW_LIMIT;
  for (const pl of places.slice(0, SPOTS_IN_VIEW_LIMIT)) {
    spots.push({
      id: pl.id,
      name: pl.name,
      href: `/pet/place/${pl.id}`,
      area: null,
      category: PLACE_CATEGORY_LABEL[pl.category] ?? "ペット施設",
      address: pl.address,
      lat: pl.lat,
      lng: pl.lng,
      imageUrl: null,
      kinds: ["facility"],
      verified: false,
      placeCategory: pl.category,
    });
  }
  return { spots, truncated: truncated || placeTruncated };
}

/** 施設ページ用: 取り込んだ施設1件 */
export async function getPetPlace(id: string) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("locapass_pet_places").select("id, source, category, name, address, lat, lng, website, opening_hours, attribution").eq("id", id).maybeSingle();
  return data as { id: string; source: string; category: PetPlaceCategory; name: string; address: string | null; lat: number; lng: number; website: string | null; opening_hours: string | null; attribution: string | null } | null;
}

/** 施設の近く(約150m)で投稿された LOCAPASS snap(みんなのフォト)。新しい順 */
export async function getNearbySnaps(lat: number, lng: number, limit = 12) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const d = 0.0015;
  const { data } = await db
    .from("area_photo_posts")
    .select("id, image_url, video_url, spot_name, comment, created_at")
    .gte("latitude", lat - d)
    .lte("latitude", lat + d)
    .gte("longitude", lng - d)
    .lte("longitude", lng + d)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; image_url: string | null; video_url: string | null; spot_name: string | null; comment: string | null; created_at: string }[];
}
