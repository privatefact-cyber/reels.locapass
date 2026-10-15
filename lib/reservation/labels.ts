import type { PaymentStatus, ReservationStatus } from "./config";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  requested: "返答待ち",
  confirmed: "予約確定",
  declined: "お受けできませんでした",
  cancelled: "取り消し済み",
  completed: "ご来店済み",
  no_show: "無断キャンセル",
};

export const STATUS_COLOR: Record<ReservationStatus, string> = {
  requested: "bg-amber-400 text-black",
  confirmed: "bg-emerald-500 text-white",
  declined: "bg-zinc-600 text-white",
  cancelled: "bg-zinc-600 text-white",
  completed: "bg-sky-500 text-white",
  no_show: "bg-red-600 text-white",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  none: "-",
  authorized: "仮決済中(未請求)",
  released: "解放済み(請求なし)",
  captured: "デポジット確定",
  failed: "決済エラー",
};

export function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
