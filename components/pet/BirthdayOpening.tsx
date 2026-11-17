"use client";

import { useEffect, useState } from "react";
import { BirthdayFrame } from "./BirthdayFrame";
import { PetAvatar } from "./ui";

export type BirthdayOpeningPet = { id: string; name: string; sex: string; avatarUrl: string | null; turning: number | null };

const COLORS = ["#FF8E5E", "#FFC94D", "#7BD8B2", "#6AADEB", "#FF8FAB", "#B79CFF"];

/**
 * きょうが誕生日の子がいるとき、アプリを開いた(ホームを開いた)ときに、1日1回だけ出す「ハッピーバースデイ」の画面。
 * 紙吹雪+犬のひとこと(「ぼく、今日誕生日だよ!」)。タップ、または数秒で閉じる。
 * 「動きを減らす」設定の端末では、紙吹雪を動かさない。
 */
export function BirthdayOpening({ dayKey, pets }: { dayKey: string; pets: BirthdayOpeningPet[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pets.length === 0) return;
    const key = `locawan-birthday-opening-${dayKey}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // 保存できない環境(プライベートブラウズなど)では、開くたびに出る
    }
    setOpen(true);
    const t = window.setTimeout(() => setOpen(false), 7000);
    return () => window.clearTimeout(t);
  }, [dayKey, pets.length]);

  if (!open || pets.length === 0) return null;
  return <BirthdayOpeningView pets={pets} onClose={() => setOpen(false)} />;
}

/** 画面そのもの(紙吹雪・ことば・ボタン)。動きの確認用に、表示の判断(1日1回)とは分けてある。 */
export function BirthdayOpeningView({ pets, onClose }: { pets: BirthdayOpeningPet[]; onClose: () => void }) {
  const shown = pets.slice(0, 3);

  return (
    <div
      role="dialog"
      aria-label="お誕生日おめでとう"
      onClick={onClose}
      className="bd-open fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#FFF7EC]/95 px-6 text-center backdrop-blur-sm"
    >
      <style>{`
        @keyframes bd-fall { 0% { transform: translate3d(0,-12vh,0) rotate(0deg); opacity: 0; } 8% { opacity: 1; } 100% { transform: translate3d(var(--dx),110vh,0) rotate(720deg); opacity: 1; } }
        @keyframes bd-pop { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes bd-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .bd-open .bd-conf { animation: bd-fall linear infinite; }
        .bd-open .bd-pop { animation: bd-pop .7s cubic-bezier(.2,1.4,.4,1) both; }
        .bd-open .bd-bounce { animation: bd-bounce 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .bd-open .bd-conf, .bd-open .bd-bounce { animation: none; opacity: 0; } .bd-open .bd-pop { animation: none; } }
      `}</style>

      {/* 紙吹雪 */}
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="bd-conf pointer-events-none absolute top-0"
          style={
            {
              left: `${(i * 97) % 100}%`,
              width: 8 + (i % 3) * 3,
              height: 12 + (i % 4) * 3,
              background: COLORS[i % COLORS.length],
              borderRadius: i % 3 === 0 ? "50%" : 2,
              animationDuration: `${3.2 + (i % 7) * 0.45}s`,
              animationDelay: `${(i % 9) * 0.35}s`,
              "--dx": `${((i % 5) - 2) * 36}px`,
            } as React.CSSProperties
          }
        />
      ))}

      <p className="bd-pop text-3xl font-extrabold tracking-wider text-[#EE6A36] drop-shadow-[0_2px_0_#fff]">HAPPY BIRTHDAY!</p>

      <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
        {shown.map((p, i) => {
          const me = p.sex === "male" ? "ぼく" : p.sex === "female" ? "わたし" : "うち";
          return (
            <div key={p.id} className="bd-pop flex flex-col items-center" style={{ animationDelay: `${0.25 + i * 0.2}s` }}>
              <div className="bd-bounce" style={{ animationDelay: `${i * 0.3}s` }}>
                <BirthdayFrame size={shown.length > 1 ? 104 : 132} sex={p.sex} ribbon>
                  <PetAvatar url={p.avatarUrl} name={p.name} size={shown.length > 1 ? 104 : 132} />
                </BirthdayFrame>
              </div>
              <p className="mt-4 text-xl font-extrabold text-[#4A3426]">{p.name}</p>
              <p className="mt-1 max-w-[240px] rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#7A5030] shadow-[0_4px_14px_-8px_rgba(122,80,40,0.5)]">
                「{me}、今日誕生日だよ!」🐶{p.turning && p.turning > 0 ? <><br />{p.turning}歳になりました!</> : null}
              </p>
            </div>
          );
        })}
      </div>

      <button type="button" className="mt-10 rounded-full bg-[#FF8E5E] px-8 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#EE6A36] active:translate-y-[2px]">
        おめでとう! 🎂
      </button>
    </div>
  );
}
