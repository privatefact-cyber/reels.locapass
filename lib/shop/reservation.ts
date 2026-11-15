import { reservationEnabled, shopCanTakeReservations } from "@/lib/reservation/config";

/**
 * 予約の入り口を、どこにするか決める(AIの「予約して」で画面を動かす先)。優先順:
 *  1. 優先予約(有料掲載店で、公開中のとき) → サイト内の予約ページ(/reserve/{店舗ID})。日時を選んで確定する仕組みは、既存のものを使う。
 *  2. 店舗が登録した外部の予約ページ(https) → そのページを開く
 *  3. 電話・LINE → 連絡の画面
 * AIは、お客様の確認の操作なしに予約を確定しない(予約の確定は、開いた画面で、お客様が行う)。
 */
export type ReservationMode =
  | { mode: "priority"; path: string }
  | { mode: "external_url"; url: string }
  | { mode: "contact" };

export function resolveReservation(shop: { shopId: string; plan: string | null; phone: string | null; lineUrl: string | null; bookingUrl: string | null }): ReservationMode | null {
  if (reservationEnabled() && shopCanTakeReservations(shop.plan)) return { mode: "priority", path: `/reserve/${shop.shopId}` };
  if (shop.bookingUrl && /^https:\/\//.test(shop.bookingUrl)) return { mode: "external_url", url: shop.bookingUrl };
  if (shop.phone || shop.lineUrl) return { mode: "contact" };
  return null;
}
