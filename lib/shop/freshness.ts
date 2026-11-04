import { sinkWithoutPhoto } from "./sinkWithoutPhoto";

/** 最後の確認から、これ以上経った店は「情報が古い」とみなして一覧の後ろへ回す。 */
const STALE_AFTER_DAYS = 365;

export type ShopFreshness = {
  url_status?: string | null;
  last_confirmed_at?: string | null;
};

/**
 * 閉店を断定するのではなく、一覧の並びだけを後ろへ回す判定。
 *  - 公式URLが連続して見つからない(url_status='dead')
 *  - 最終確認日が STALE_AFTER_DAYS より古い
 * 最終確認日が空(まだ一度も確認していない)の店は、古いとはみなさない。
 */
export function isStaleShop(s: ShopFreshness, now: number = Date.now()): boolean {
  if (s.url_status === "dead") return true;
  const at = s.last_confirmed_at ? Date.parse(s.last_confirmed_at) : NaN;
  return Number.isFinite(at) && now - at > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** 情報が古い店を後ろへ回す。並びは安定(元の順序を保つ)。 */
export function sinkStale<T extends ShopFreshness>(items: T[]): T[] {
  return sinkWithoutPhoto(items, (s) => !isStaleShop(s));
}
