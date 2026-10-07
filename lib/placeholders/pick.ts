/**
 * 店舗の写真が無い/壊れているときに出す「イメージ写真・動画」を選ぶ。
 * 中身は scripts/fetch-placeholder-media.ts がPexels(無料)から集めた manifest.json。
 * あくまで見た目を整えるためのダミー。店舗が自分の写真/動画を入れたら、そちらが優先される(これは使われない)。
 */
import manifest from "./manifest.json";
import { groupOfCategory } from "@/lib/reels/tags/vocabulary";

export type PlaceholderPick =
  | { kind: "photo"; url: string; credit: string; creditUrl: string }
  | { kind: "video"; url: string; poster: string | null; credit: string; creditUrl: string };

type Entry = { url: string; poster?: string | null; credit: string; creditUrl: string };
type Group = { photos: Entry[]; videos: Entry[] };

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** カテゴリ(店舗のジャンル)に合うグループ。分からなければ other。 */
function groupKey(category: string | null | undefined): keyof typeof manifest {
  const g = groupOfCategory(category);
  return g === "food" || g === "shop" || g === "tour" || g === "stay" || g === "pet" || g === "beauty" ? g : "other";
}

/** seed(店舗IDなど)から毎回同じ1つを選ぶ。動画を許可すると、動画があればそれを優先する。集めていなければnull(→グラデーション表示)。 */
export function pickPlaceholder(
  category: string | null | undefined,
  seed: string,
  opts: { allowVideo?: boolean } = {},
): PlaceholderPick | null {
  const group = (manifest as Record<string, Group>)[groupKey(category)];
  const fallbackGroup = (manifest as Record<string, Group>).other;
  const h = hash(seed);
  if (opts.allowVideo) {
    const videos = group.videos.length ? group.videos : fallbackGroup.videos;
    if (videos.length) {
      const v = videos[h % videos.length];
      return { kind: "video", url: v.url, poster: v.poster ?? null, credit: v.credit, creditUrl: v.creditUrl };
    }
  }
  const photos = group.photos.length ? group.photos : fallbackGroup.photos;
  if (photos.length) {
    const p = photos[h % photos.length];
    return { kind: "photo", url: p.url, credit: p.credit, creditUrl: p.creditUrl };
  }
  return null;
}
