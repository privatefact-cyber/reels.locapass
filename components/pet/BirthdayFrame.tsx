import type { ReactNode } from "react";

/**
 * 誕生日の当日だけ、犬のアイコンにつける「ハッピーバースデイ」の枠。
 * 回るふち+はずむ帽子+きらきらの紙吹雪。ribbon を true にすると、下に「HAPPY BIRTHDAY!」のリボンも出す。
 * 男の子と女の子で、はっきり見た目が変わる: 男の子=青系+「♂」、女の子=ピンク系+「♀」、不明=オレンジ系。
 */
const THEMES = {
  male: {
    ring: "conic-gradient(#2F86E6, #8EC5FF, #2F86E6, #B9DDFF, #2F86E6)",
    ribbon: "from-[#2F86E6] via-[#5AA5F0] to-[#7BC8FF]",
    ribbonShadow: "shadow-[0_3px_0_#1F62B0]",
    glow: "shadow-[0_6px_18px_-4px_rgba(47,134,230,0.85)]",
    mark: "♂",
    markBg: "bg-[#2F86E6]",
    hat: "🥳",
    deco: ["🎈", "🎊", "✨", "🎉"],
  },
  female: {
    ring: "conic-gradient(#FF5C8A, #FFB3C9, #FF5C8A, #FFD0DD, #FF5C8A)",
    ribbon: "from-[#FF5C8A] via-[#FF8FAB] to-[#FFB3C9]",
    ribbonShadow: "shadow-[0_3px_0_#D93D6B]",
    glow: "shadow-[0_6px_18px_-4px_rgba(255,92,138,0.85)]",
    mark: "♀",
    markBg: "bg-[#FF5C8A]",
    hat: "🥳",
    deco: ["🎀", "🌸", "✨", "🎉"],
  },
  unknown: {
    ring: "conic-gradient(#FF8E5E, #FFC94D, #7BD8B2, #6AADEB, #FF8FAB, #FF8E5E)",
    ribbon: "from-[#FF8E5E] via-[#FF8FAB] to-[#FFC94D]",
    ribbonShadow: "shadow-[0_3px_0_#EE6A36]",
    glow: "shadow-[0_6px_18px_-6px_rgba(238,106,54,0.7)]",
    mark: "",
    markBg: "",
    hat: "🥳",
    deco: ["🎈", "🎊", "✨", "🎉"],
  },
} as const;

export function BirthdayFrame({ size, sex = "unknown", ribbon = false, children }: { size: number; sex?: string; ribbon?: boolean; children: ReactNode }) {
  const theme = sex === "male" ? THEMES.male : sex === "female" ? THEMES.female : THEMES.unknown;
  const pad = Math.max(5, Math.round(size * 0.1));
  const confetti = Math.max(12, Math.round(size * 0.2));
  const mark = Math.max(18, Math.round(size * 0.26));
  return (
    <span className="bdf relative inline-flex flex-col items-center">
      <style>{`
        @keyframes bdf-spin { to { transform: rotate(360deg); } }
        @keyframes bdf-hat { 0%,100% { transform: translateX(-50%) rotate(-8deg) translateY(0); } 50% { transform: translateX(-50%) rotate(8deg) translateY(-4px); } }
        @keyframes bdf-twinkle { 0%,100% { transform: scale(1) translateY(0); opacity: 1; } 50% { transform: scale(1.3) translateY(-5px); opacity: .75; } }
        .bdf .bdf-ring { animation: bdf-spin 5s linear infinite; }
        .bdf .bdf-hat { animation: bdf-hat 1.4s ease-in-out infinite; }
        .bdf .bdf-deco { animation: bdf-twinkle 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .bdf .bdf-ring, .bdf .bdf-hat, .bdf .bdf-deco { animation: none; } .bdf .bdf-hat { transform: translateX(-50%); } }
      `}</style>
      <span className="relative inline-flex">
        {/* 回るふち(絵は回さず、後ろのふちだけ回す) */}
        <span className={`inline-flex rounded-full ${theme.glow}`} style={{ padding: pad, position: "relative" }}>
          <span className="bdf-ring absolute inset-0 rounded-full" style={{ background: theme.ring }} aria-hidden />
          <span className="relative inline-flex">{children}</span>
        </span>
        {/* 頭の帽子 */}
        <span className="bdf-hat absolute left-1/2 select-none" style={{ top: -size * 0.28, fontSize: size * 0.34 }} aria-hidden>
          {theme.hat}
        </span>
        {/* まわりの紙吹雪(ずらして、きらきら) */}
        {[
          { left: -confetti * 0.6, top: size * 0.12, f: confetti, d: 0 },
          { right: -confetti * 0.6, top: size * 0.18, f: confetti, d: 0.4 },
          { left: -confetti * 0.2, bottom: size * 0.02, f: confetti * 0.8, d: 0.8 },
          { right: -confetti * 0.3, bottom: size * 0.05, f: confetti * 0.8, d: 1.2 },
        ].map((p, i) => (
          <span key={i} className="bdf-deco pointer-events-none absolute select-none" style={{ left: p.left, right: p.right, top: p.top, bottom: p.bottom, fontSize: p.f, animationDelay: `${p.d}s` }} aria-hidden>
            {theme.deco[i]}
          </span>
        ))}
        {/* ♂ / ♀ のしるし */}
        {theme.mark && (
          <span
            className={`absolute flex items-center justify-center rounded-full border-2 border-white font-extrabold leading-none text-white shadow ${theme.markBg}`}
            style={{ width: mark, height: mark, fontSize: mark * 0.7, right: -mark * 0.15, top: size * 0.02 }}
            aria-label={sex === "male" ? "男の子" : "女の子"}
          >
            {theme.mark}
          </span>
        )}
      </span>
      {ribbon && (
        <span className={`-mt-3 whitespace-nowrap rounded-full bg-gradient-to-r ${theme.ribbon} px-4 py-1 text-[11px] font-extrabold tracking-wider text-white ${theme.ribbonShadow}`}>
          🎂 HAPPY BIRTHDAY! 🎂
        </span>
      )}
    </span>
  );
}
