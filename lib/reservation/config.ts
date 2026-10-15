/** 優先予約の共通設定。 */
/** デポジットは 1人500円・上限5,000円。 */
export const DEPOSIT_PER_PERSON = 500;
export const DEPOSIT_MAX = 5000;
export const depositFor = (partySize: number) => Math.min(DEPOSIT_PER_PERSON * Math.max(1, partySize), DEPOSIT_MAX);

/**
 * カードの保証方法。来店がこの日数以内なら与信保持(hold: 枠を確保。回収はほぼ確実)。
 * 与信の有効期間はカード会社の都合で約7日なので、処理の余裕を見て5日。
 * それより先はカード保存(save: 枠は確保せず、無断キャンセルのときだけ保存カードに請求)。
 */
export const HOLD_MAX_DAYS = 5;
export const MAX_DAYS_AHEAD = 30;
export type PaymentMethod = "hold" | "save";
export const methodFor = (reserveAtMs: number, nowMs = Date.now()): PaymentMethod =>
  reserveAtMs - nowMs <= HOLD_MAX_DAYS * 24 * 3600_000 ? "hold" : "save";

/** 来店の処理がされないまま、この時間が過ぎたら自動で解放する(自動で没収はしない)。 */
export const AUTO_RELEASE_HOURS = 24;
/** お店が返答しないまま、この時間が過ぎた(または来店の30分前になった)リクエストは自動で辞退し解放する。 */
export const AUTO_DECLINE_HOURS = 12;

/** はじめて予約するお客様(来店済みの実績なし)の上限。 */
export const NEWBIE_MAX_PARTY = 6;
export const NEWBIE_MAX_OPEN = 1;

/** 没収額から差し引く、Stripe決済手数料の見込み率(実額は接続後にStripeの値で置き換える)。 */
export const FEE_RATE = 0.036;
/** 受付は、来店のこの時間前まで。 */
export const MIN_LEAD_HOURS = 1;
/** お客様が無料で取り消せる期限の既定値(来店のN時間前まで)。店舗ごとに設定でき、それ以降の取り消しは「お店の判断待ち」になる。 */
export const DEFAULT_FREE_CANCEL_HOURS = 3;
export const FREE_CANCEL_CHOICES = [0, 1, 3, 6, 12, 24, 48] as const;
/** 同時に持てる未完了の予約(リクエスト中+確定・来店前)の上限。 */
export const MAX_OPEN_PER_USER = 3;

export type ReservationStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show"
  | "cancel_review"
  | "late_cancelled";
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
  payment_method: PaymentMethod;
  card_fingerprint: string | null;
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
