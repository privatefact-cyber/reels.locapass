import { PHOTO_WALL } from "@/lib/photowall/config";
import { dummyPhotoUrl, type PhotoWallPresetId } from "@/lib/photowall/presets";

export type WallTile = {
  src: string;
  /** 投稿写真(true)かダミー(false)か。 */
  real: boolean;
  /** 傾き(度)・ずれ(%)・大きさ。スロット番号から決めるので、再読み込みしても変わらない。 */
  rotate: number;
  shiftX: number;
  shiftY: number;
  scale: number;
  /** 縦長・正方形・横長を混ぜる。 */
  aspect: string;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledSlots(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * 壁のタイルを組み立てる。DBには何も持たず、投稿写真の一覧だけから毎回同じ結果を計算する。
 *  - 投稿写真(新しい順)を、古い順に番号を振ったスロットへ貼る。新着は「次のスロット」に貼られ、
 *    そこにあったダミー(または一番古い投稿)を押し出す。既存の写真の位置は、新着が来ても動かない。
 *  - 残りのスロットは、ダミー写真で埋める(スロット番号ごとに決まった1枚)。
 */
export function buildWallTiles(realUrlsNewestFirst: string[], preset: PhotoWallPresetId): WallTile[] {
  const n = PHOTO_WALL.slots;
  const order = shuffledSlots(n, 20261030);
  const total = realUrlsNewestFirst.length;
  const bySlot = new Map<number, string>();
  realUrlsNewestFirst.slice(0, n).forEach((url, k) => {
    bySlot.set(order[(total - 1 - k + n * 1000) % n], url);
  });

  return Array.from({ length: n }, (_, slot) => {
    const rand = mulberry32(slot * 7919 + 13);
    const real = bySlot.get(slot);
    return {
      src: real ?? dummyPhotoUrl(preset, slot + Math.floor(rand() * 5)),
      real: real != null,
      rotate: (rand() - 0.5) * 9,
      shiftX: (rand() - 0.5) * 60,
      shiftY: (rand() - 0.5) * 60,
      scale: 0.85 + rand() * 0.45,
      aspect: rand() < 0.55 ? "4/5" : rand() < 0.6 ? "1/1" : "5/4",
    };
  });
}
