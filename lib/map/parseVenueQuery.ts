import { DEFAULT_RADIUS_M, radiusToBounds, type VenueBounds } from "@/lib/map/getVenues";

export type ParsedVenueQuery =
  | { ok: true; bounds: VenueBounds; center: { lat: number; lng: number } }
  | { ok: false; error: string };

/** 半径指定の上限(m)。これ以上は実質「広域の全件取得」になるので受け付けない。 */
const MAX_RADIUS_M = 20_000;
/** 矩形指定の上限(度)。日本列島を丸ごと覆うようなbboxを弾く。 */
const MAX_BBOX_SPAN_DEG = 5;

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 位置の指定が無いリクエストは弾く。パラメータ無しでの全件取得を
 * APIレベルで不可能にしておくのが目的(クライアント側の実装ミスで全国分を
 * 引いてしまう事故を構造的に防ぐ)。
 */
export function parseVenueQuery(searchParams: URLSearchParams): ParsedVenueQuery {
  const bbox = searchParams.get("bbox");
  if (bbox) {
    const parts = bbox.split(",").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
      return { ok: false, error: "bbox must be 'minLng,minLat,maxLng,maxLat'" };
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (minLat >= maxLat || minLng >= maxLng) {
      return { ok: false, error: "bbox min values must be smaller than max values" };
    }
    if (maxLat - minLat > MAX_BBOX_SPAN_DEG || maxLng - minLng > MAX_BBOX_SPAN_DEG) {
      return { ok: false, error: `bbox is too large (max ${MAX_BBOX_SPAN_DEG} degrees per side)` };
    }
    return {
      ok: true,
      bounds: { minLat, maxLat, minLng, maxLng },
      center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    };
  }

  const lat = num(searchParams.get("lat"));
  const lng = num(searchParams.get("lng"));
  if (lat === null || lng === null) {
    return { ok: false, error: "lat and lng (or bbox) are required" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "lat/lng out of range" };
  }

  const radius = num(searchParams.get("radius")) ?? DEFAULT_RADIUS_M;
  if (radius <= 0 || radius > MAX_RADIUS_M) {
    return { ok: false, error: `radius must be between 1 and ${MAX_RADIUS_M} meters` };
  }

  return { ok: true, bounds: radiusToBounds(lat, lng, radius), center: { lat, lng } };
}
