"use client";

/**
 * 誕生日の当日じゅう、画面の上から紙吹雪をふらせ続ける(さわれない・じゃまにならない)。
 * 色は、男の子=青系、女の子=ピンク系、不明=にじ色。「動きを減らす」設定の端末では出さない。
 */
const PALETTES = {
  male: ["#2F86E6", "#8EC5FF", "#B9DDFF", "#FFC94D", "#7BD8B2"],
  female: ["#FF5C8A", "#FFB3C9", "#FFD0DD", "#FFC94D", "#FF8E5E"],
  unknown: ["#FF8E5E", "#FFC94D", "#7BD8B2", "#6AADEB", "#FF8FAB"],
} as const;

export function BirthdayConfetti({ sex = "unknown" }: { sex?: string }) {
  const colors = sex === "male" ? PALETTES.male : sex === "female" ? PALETTES.female : PALETTES.unknown;
  return (
    <div aria-hidden className="bdc pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <style>{`
        @keyframes bdc-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 0; } 10% { opacity: .95; } 100% { transform: translate3d(var(--dx),108vh,0) rotate(540deg); opacity: .95; } }
        .bdc .bdc-p { animation: bdc-fall linear infinite; }
        @media (prefers-reduced-motion: reduce) { .bdc { display: none; } }
      `}</style>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="bdc-p absolute top-0"
          style={
            {
              left: `${(i * 53 + 7) % 100}%`,
              width: 7 + (i % 3) * 3,
              height: 10 + (i % 4) * 3,
              background: colors[i % colors.length],
              borderRadius: i % 3 === 0 ? "50%" : 2,
              animationDuration: `${5 + (i % 6) * 0.9}s`,
              animationDelay: `${(i % 11) * 0.6}s`,
              "--dx": `${((i % 5) - 2) * 30}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
