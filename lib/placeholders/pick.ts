/**
 * 店舗の写真が無い/壊れているときに出す「イメージ写真・動画」を選ぶ。
 * 中身は scripts/fetch-placeholder-media.ts がPixabay(無料)から集めた manifest.json(ファイルは public/placeholders/)。
 * あくまで見た目を整えるためのダミー。店舗が自分の写真/動画を入れたら、そちらが優先される(これは使われない)。
 */
import manifest from "./manifest.json";
import assignments from "./assignments.json";
import { groupOfCategory } from "@/lib/reels/tags/vocabulary";

export type PlaceholderPick =
  | { kind: "photo"; url: string; credit: string; creditUrl: string; source: string }
  | { kind: "video"; url: string; poster: string | null; credit: string; creditUrl: string; source: string };

export type PlaceholderEntry = { url: string; poster?: string | null; credit: string; creditUrl: string; source?: string };
type Entry = PlaceholderEntry;
type Group = { photos: Entry[]; videos: Entry[] };

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** カテゴリ(店舗のジャンル)に合うグループ。分からなければ other。 */
export function groupKeyOf(category: string | null | undefined): keyof typeof manifest {
  const g = groupOfCategory(category);
  return g === "food" || g === "shop" || g === "tour" || g === "stay" || g === "pet" || g === "beauty" ? g : "other";
}

/**
 * 店舗(seed=店舗ID)に割り当て済みの写真/動画を返す(scripts/assign-placeholders.ts が店舗ごとに別々の写真を割り当てている)。
 * 割り当てが無い(新しい店舗)ときだけ、seedから毎回同じ写真を選ぶ(この場合は他の店舗と重なることがある。動画は使わない)。
 * 動画を許可すると、その店舗に動画が割り当てられていれば動画を返す(動画は各グループで1店舗だけ)。
 * 素材を集めていなければnull(→グラデーション表示)。
 */
export function pickPlaceholder(
  category: string | null | undefined,
  seed: string,
  opts: { allowVideo?: boolean } = {},
): PlaceholderPick | null {
  const assigned = (assignments as Record<string, { photo: Entry; video?: Entry }>)[seed];
  if (assigned) {
    if (opts.allowVideo && assigned.video) {
      const v = assigned.video;
      return { kind: "video", url: v.url, poster: v.poster ?? null, credit: v.credit, creditUrl: v.creditUrl, source: v.source ?? "Pixabay" };
    }
    const p = assigned.photo;
    return { kind: "photo", url: p.url, credit: p.credit, creditUrl: p.creditUrl, source: p.source ?? "Pixabay" };
  }
  const group = (manifest as Record<string, Group>)[groupKeyOf(category)];
  const fallbackGroup = (manifest as Record<string, Group>).other;
  const photos = group.photos.length ? group.photos : fallbackGroup.photos;
  if (photos.length) {
    const p = photos[hash(seed) % photos.length];
    return { kind: "photo", url: p.url, credit: p.credit, creditUrl: p.creditUrl, source: p.source ?? "Pixabay" };
  }
  return null;
}

/** 店舗に割り当て済みの写真/動画(ダミーリール用)。無ければnull。 */
export function assignedPlaceholder(shopId: string): { photo: Entry; video?: Entry } | null {
  return (assignments as Record<string, { photo: Entry; video?: Entry }>)[shopId] ?? null;
}
