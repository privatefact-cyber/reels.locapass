import type { PhotoPost } from "@/lib/photo/getPhotoPosts";

/** 掲載店ではない場所(穴場)。複数の投稿を同じ場所としてまとめたもの。 */
export type HiddenSpot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  site: string;
  posts: PhotoPost[];
  likeCount: number;
  latest: string;
};

/** 同じ場所とみなす距離(m)。 */
const MERGE_RADIUS_M = 40;

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_()（）「」【】&＆.,'’"]/g, "");

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * 掲載店として選ばれなかった写真(placeKind が listed 以外)を「穴場」として場所ごとにまとめる。
 * Googleの場所ID(place_id)が同じなら同じ場所。IDが無い手入力は、場所名が同じ(または一方がもう一方を含む)で
 * 40m以内なら同じ場所にする。投稿時の自動紐付け(近い掲載店のvenue_id)は、手入力の場所名が別の店でも付くので使わない。
 */
export function buildHiddenSpots(posts: PhotoPost[]): HiddenSpot[] {
  const spots: HiddenSpot[] = [];
  const keyed = new Map<string, HiddenSpot>();

  for (const post of posts) {
    if (post.placeKind === "listed") continue;
    const name = (post.placeName || post.spotName || "").trim();
    if (!name) continue;

    let spot: HiddenSpot | undefined = post.placeId ? keyed.get(`g:${post.placeId}`) : undefined;
    if (!spot) {
      const n = norm(name);
      spot = spots.find((s) => {
        if (distanceM(s.lat, s.lng, post.latitude, post.longitude) > MERGE_RADIUS_M) return false;
        const m = norm(s.name);
        return n.length > 0 && m.length > 0 && (n.includes(m) || m.includes(n));
      });
    }
    if (!spot) {
      spot = { id: `h${spots.length}`, name, lat: post.latitude, lng: post.longitude, placeId: post.placeId, site: post.site, posts: [], likeCount: 0, latest: "" };
      spots.push(spot);
      if (post.placeId) keyed.set(`g:${post.placeId}`, spot);
    }
    spot.posts.push(post);
    spot.likeCount += post.likeCount;
    if (post.createdAt > spot.latest) spot.latest = post.createdAt;
  }
  for (const s of spots) s.posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return spots;
}

export type HiddenSpotSort = "popular" | "new";

export function sortHiddenSpots(spots: HiddenSpot[], sort: HiddenSpotSort): HiddenSpot[] {
  const copy = [...spots];
  if (sort === "new") return copy.sort((a, b) => b.latest.localeCompare(a.latest));
  // 人気順: いいね+写真の枚数が多い順(同点は新しい順)
  return copy.sort((a, b) => b.likeCount + b.posts.length - (a.likeCount + a.posts.length) || b.latest.localeCompare(a.latest));
}
