import { createStaticClient } from "@/lib/supabase/static";
import type { VenueBounds } from "@/lib/map/getVenues";
import type { VenueFilters } from "@/lib/map/venueFilters";

/**
 * ポータルの地図の初期設定(locapass_portals.map_preset。00179)。地図は全国で1系統(/map)で、
 * ポータルの地図は「全国地図をこの初期設定で開く」だけ(表示の絞り込みはしない)。
 */
export type MapPreset = {
  center?: { lat: number; lng: number };
  zoom?: number;
  /** map_preset が無いポータルは、所属店舗が収まる範囲で開く。 */
  bounds?: VenueBounds;
  layers: VenueFilters;
};

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;

/** DBの値を検証して取り出す。形が違う項目は無視する(壊れた設定で地図が開けなくならないように)。 */
export function parseMapPreset(raw: unknown): MapPreset | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as { center?: unknown; zoom?: unknown; layers?: unknown };
  const out: MapPreset = { layers: { pet: false, now: false } };
  if (Array.isArray(r.center) && r.center.length === 2) {
    const [lng, lat] = r.center.map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.center = { lat, lng };
  }
  if (typeof r.zoom === "number" && Number.isFinite(r.zoom)) out.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, r.zoom));
  if (r.layers && typeof r.layers === "object") {
    const layers = r.layers as { pet?: unknown; now?: unknown };
    out.layers = { pet: layers.pet === true, now: layers.now === true };
  }
  return out;
}

/**
 * /map?preset={slug} の初期設定。知らないslugなら null(通常の /map として開く)。
 * map_preset が未設定のポータルは、所属する掲載中店舗が収まる範囲を返す(店舗も無ければ null)。
 */
export async function getMapPreset(slug: string | null | undefined): Promise<MapPreset | null> {
  if (!slug || !/^[a-z0-9-]{1,64}$/i.test(slug)) return null;
  const supabase = createStaticClient();
  // map_preset は生成済みの型に無い(00179)。
  const { data: portal, error } = await (supabase as any).from("locapass_portals").select("id, map_preset").eq("slug", slug).maybeSingle();
  if (error || !portal) {
    // 列がまだ無い(マイグレーション前)ときは、slugだけで引き直して範囲で開く。
    if (!error) return null;
    const { data: p } = await supabase.from("locapass_portals").select("id").eq("slug", slug).maybeSingle();
    return p ? boundsPreset(p.id) : null;
  }
  const preset = parseMapPreset(portal.map_preset);
  if (preset?.center) return preset;
  const fallback = await boundsPreset(portal.id);
  return fallback ? { ...fallback, layers: preset?.layers ?? fallback.layers } : null;
}

async function boundsPreset(portalId: number): Promise<MapPreset | null> {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select("lat, lng")
    .eq("portal_id", portalId)
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(2000);
  const coords = (data ?? []) as { lat: number; lng: number }[];
  if (coords.length === 0) return null;
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const bounds = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  return {
    bounds,
    center: { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 },
    layers: { pet: false, now: false },
  };
}
