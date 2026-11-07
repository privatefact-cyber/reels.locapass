import { BadgeCheck } from "lucide-react";

/**
 * 「LOCAPASS認証」マーク。LOCAPASSに掲載中のお店=実際に営業していることを運営が確認できているお店。
 * OpenStreetMap等から取り込んだ施設(営業状況は未確認)と見分けられるよう、目立つ金色にする。
 */
export function VerifiedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      title="LOCAPASSに掲載中のお店です(営業を確認済み)"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-[#F6C33B] to-[#F59E0B] font-extrabold text-white shadow-[0_2px_6px_-2px_rgba(245,158,11,0.8)] ${size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]"}`}
    >
      <BadgeCheck size={size === "md" ? 14 : 12} strokeWidth={2.6} />
      LOCAPASS認証
    </span>
  );
}
