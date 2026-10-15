import type { BoostItem } from "./types";

/**
 * 【将来のPush通知拡張用プレースホルダー】
 * ブースト作成直後に呼ばれる。将来、位置情報連動のWebPush/FCMで
 * 「店舗から○km以内でフォロー/お気に入りしているユーザー」へ配信する処理をここに実装する。
 * 現状は何もしない(端末プッシュ基盤=VAPID鍵等が未整備のため)。呼び出し側は失敗しても投稿を止めない。
 *
 *   例: const targets = await findUsersNear(boost.shop.lat, boost.shop.lng, 3000);
 *       await sendWebPush(targets, { title: `⚡ ${boost.shop.name}`, body: boost.title, url: "/boost" });
 */
export async function notifyBoostCreated(_boost: Pick<BoostItem, "id" | "title"> & { shopId: string }): Promise<void> {
  // no-op
}
