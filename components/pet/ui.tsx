import type { ReactNode } from "react";

/**
 * ロカわんの見た目の共通部品。色はクリーム地・ココア色の文字・ピーチのアクセント。
 * (サイト全体のテーマ変数は使わず、/pet の中だけで完結させる)
 */
export const PET_COLORS = {
  bg: "#FFF7EC",
  ink: "#4A3426",
  sub: "#9C8273",
  line: "#F1E1CF",
  peach: "#FF8E5E",
  peachDark: "#EE6A36",
  mint: "#4FBF9F",
  sky: "#6AADEB",
  pink: "#FF8FAB",
  honey: "#FFC94D",
};

/** 肉球の柄(背景にうっすら敷く) */
export const PAW_PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><g fill='#F4DFC8' opacity='0.55' transform='rotate(-18 32 32)'><ellipse cx='32' cy='40' rx='9' ry='7.5'/><circle cx='21' cy='29' r='4'/><circle cx='28' cy='23' r='4'/><circle cx='36' cy='23' r='4'/><circle cx='43' cy='29' r='4'/></g></svg>`,
)}")`;

export function PetCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-[#F1E1CF] bg-white p-4 shadow-[0_6px_20px_-12px_rgba(122,80,40,0.35)] ${className}`}>{children}</div>;
}

export function PetSectionTitle({ emoji, children, action }: { emoji?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#4A3426]">
        {emoji && <span aria-hidden>{emoji}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

export const petButton = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FF8E5E] px-5 py-3 text-[15px] font-extrabold text-white shadow-[0_4px_0_#EE6A36] transition active:translate-y-[2px] active:shadow-[0_2px_0_#EE6A36] disabled:opacity-50",
  soft: "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FFEBDD] px-4 py-2.5 text-sm font-bold text-[#C2562A] transition active:scale-95 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-[#9C8273] transition active:scale-95",
  danger: "inline-flex items-center justify-center gap-1 rounded-full bg-[#FFE4E4] px-4 py-2.5 text-sm font-bold text-[#D04848] transition active:scale-95 disabled:opacity-50",
};

/** iOSでズームしないよう16px以上(text-base) */
export const petInput =
  "w-full rounded-2xl border-2 border-[#F1E1CF] bg-[#FFFCF8] px-4 py-3 text-base text-[#4A3426] outline-none transition placeholder:text-[#C9B3A3] focus:border-[#FF8E5E] focus:bg-white";

export function PetField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-xs text-[#B39C8C]">{hint}</span>}
    </label>
  );
}

export function StatusPill({ status }: { status: "none" | "valid" | "soon" | "expired" }) {
  const map = {
    valid: { label: "有効", cls: "bg-[#DDF5EC] text-[#2E9C7C]" },
    soon: { label: "もうすぐ", cls: "bg-[#FFF0C9] text-[#B7860B]" },
    expired: { label: "期限切れ", cls: "bg-[#FFE1E1] text-[#D04848]" },
    none: { label: "期限なし", cls: "bg-[#EEF2F7] text-[#6B7A90]" },
  }[status];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${map.cls}`}>{map.label}</span>;
}

/** 丸いアイコン(写真が無ければ犬の顔) */
export function PetAvatar({ url, name, size = 64, ring = true }: { url: string | null; name: string; size?: number; ring?: boolean }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFE3CF] ${ring ? "ring-4 ring-white" : ""}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.5 }} aria-hidden>
          🐶
        </span>
      )}
    </span>
  );
}
