import type { ReactNode } from "react";

/**
 * 誕生日の当日だけ、犬のアイコンにつける「ハッピーバースデイ」の枠。
 * ふち+頭のパーティー帽子+まわりの紙吹雪。ribbon を true にすると、下に「HAPPY BIRTHDAY!」のリボンも出す。
 * 色は、男の子=青系、女の子=ピンク系、不明=にじ色。
 */
const THEMES = {
  male: {
    ring: "conic-gradient(#6AADEB, #A8D4FF, #7BD8B2, #FFC94D, #6AADEB)",
    ribbon: "from-[#5A9FE0] via-[#7BB8F0] to-[#7BD8B2]",
    ribbonShadow: "shadow-[0_3px_0_#3F7FBF]",
    glow: "shadow-[0_6px_18px_-6px_rgba(90,159,224,0.8)]",
  },
  female: {
    ring: "conic-gradient(#FF8FAB, #FFC0D0, #FFC94D, #FF8E5E, #FF8FAB)",
    ribbon: "from-[#FF7FA0] via-[#FF9FB8] to-[#FFC94D]",
    ribbonShadow: "shadow-[0_3px_0_#E05C80]",
    glow: "shadow-[0_6px_18px_-6px_rgba(255,127,160,0.8)]",
  },
  unknown: {
    ring: "conic-gradient(#FF8E5E, #FFC94D, #7BD8B2, #6AADEB, #FF8FAB, #FF8E5E)",
    ribbon: "from-[#FF8E5E] via-[#FF8FAB] to-[#FFC94D]",
    ribbonShadow: "shadow-[0_3px_0_#EE6A36]",
    glow: "shadow-[0_6px_18px_-6px_rgba(238,106,54,0.7)]",
  },
} as const;

export function BirthdayFrame({ size, sex = "unknown", ribbon = false, children }: { size: number; sex?: string; ribbon?: boolean; children: ReactNode }) {
  const theme = sex === "male" ? THEMES.male : sex === "female" ? THEMES.female : THEMES.unknown;
  const pad = Math.max(5, Math.round(size * 0.1));
  const confetti = Math.max(12, Math.round(size * 0.2));
  return (
    <span className="relative inline-flex flex-col items-center">
      <span className="relative inline-flex">
        <span
          className={`inline-flex rounded-full ${theme.glow}`}
          style={{ padding: pad, background: theme.ring }}
        >
          {children}
        </span>
        {/* 頭の帽子 */}
        <span className="absolute left-1/2 -translate-x-1/2 -rotate-6 select-none" style={{ top: -size * 0.26, fontSize: size * 0.34 }} aria-hidden>
          🥳
        </span>
        {/* 紙吹雪 */}
        <span className="pointer-events-none absolute select-none" style={{ left: -confetti * 0.6, top: size * 0.12, fontSize: confetti }} aria-hidden>
          🎈
        </span>
        <span className="pointer-events-none absolute select-none" style={{ right: -confetti * 0.6, top: size * 0.18, fontSize: confetti }} aria-hidden>
          🎊
        </span>
        <span className="pointer-events-none absolute select-none" style={{ left: -confetti * 0.2, bottom: size * 0.02, fontSize: confetti * 0.8 }} aria-hidden>
          ✨
        </span>
        <span className="pointer-events-none absolute select-none" style={{ right: -confetti * 0.3, bottom: size * 0.05, fontSize: confetti * 0.8 }} aria-hidden>
          🎉
        </span>
      </span>
      {ribbon && (
        <span className={`-mt-3 rounded-full bg-gradient-to-r ${theme.ribbon} whitespace-nowrap px-4 py-1 text-[11px] font-extrabold tracking-wider text-white ${theme.ribbonShadow}`}>
          🎂 HAPPY BIRTHDAY! 🎂
        </span>
      )}
    </span>
  );
}
