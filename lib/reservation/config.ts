/** 優先予約の共通設定。 */
export const DEPOSIT_AMOUNT = 1000;
/** 与信(仮決済)の有効期間はカード会社の都合で約7日。それを超える先の予約は受けない。 */
export const MAX_DAYS_AHEAD = 7;
/** 受付は、来店のこの時間前まで。 */
export const MIN_LEAD_HOURS = 1;
/** 客が確定後に自分で取り消せるのは、来店のこの時間前まで(直前はお店へ連絡)。 */
export const CUSTOMER_CANCEL_HOURS = 3;
/** 同時に持てる未完了の予約(リクエスト中+確定・来店前)の上限。 */
export const MAX_OPEN_PER_USER = 3;

export type ReservationStatus = "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "none" | "authorized" | "released" | "captured" | "failed";

export type ReservationRow = {
  id: string;
  shop_id: string;
  user_id: string;
  party_size: number;
  reserve_at: string;
  note: string | null;
  contact_name: string;
  contact_phone: string;
  status: ReservationStatus;
  deposit_amount: number;
  payment_provider: "stub" | "stripe";
  payment_status: PaymentStatus;
  payment_ref: string | null;
  shop_message: string | null;
  responded_at: string | null;
  settled_at: string | null;
  created_at: string;
};

/**
 * 優先予約を公開してよいか。環境変数 RESERVATION_ENABLED=on のときだけ(既定オフ=本番では見えない)。
 * Stripe接続前の仮決済(課金なし)は、開発環境か RESERVATION_STUB=on のときだけ許す。
 * これで「本番で、実際には課金されないデポジットを客に見せる」事故を防ぐ。
 */
export function reservationEnabled(): boolean {
  if (process.env.RESERVATION_ENABLED !== "on") return false;
  if (process.env.STRIPE_SECRET_KEY) return true;
  return process.env.NODE_ENV !== "production" || process.env.RESERVATION_STUB === "on";
}

/** 予約機能の利用権限は有料掲載店舗のみ(無料掲載=plan 'free' は不可)。 */
export function shopCanTakeReservations(plan: string | null | undefined): boolean {
  return !!plan && plan !== "free";
}
