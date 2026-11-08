export type InquiryType = "shop" | "agency";
export type InquiryStatus = "new" | "in_progress" | "replied" | "closed";

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "新規",
  in_progress: "対応中",
  replied: "返信済み",
  closed: "完了",
};

export const STATUS_STYLE: Record<InquiryStatus, string> = {
  new: "bg-rose-100 text-rose-800",
  in_progress: "bg-amber-100 text-amber-900",
  replied: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
};

export const STATUSES: InquiryStatus[] = ["new", "in_progress", "replied", "closed"];

export const TYPE_LABEL: Record<InquiryType, string> = {
  shop: "掲載店",
  agency: "販売代理店",
};

export function isStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

/** 連絡先の文字列がメールアドレスなら、そのメールアドレスを返す(電話番号などは null)。 */
export function extractEmail(contact: string): string | null {
  const m = contact.trim().match(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/);
  return m ? m[0] : null;
}
