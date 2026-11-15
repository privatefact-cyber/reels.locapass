"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Heart, Info, RotateCcw, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { ShopAiInput, ShopAiMessages, clearAiReturn, consumeAiReturn, useShopAi, voiceOutput, type Ai } from "@/components/shop/ShopAiChat";

/** 会話画面に出す「顔」。店舗が選び、本人の承諾が確認できたものだけ(無いときはAIのアイコン)。 */
export type AiProfile = {
  name: string;
  avatarUrl: string | null;
  photoUrl?: string | null;
  status?: string | null;
  /** 顔の由来の印(「週間1位」など)。 */
  badge?: string | null;
  /** 丸いアイコンをタップしたときの行き先(そのキャスト・スタッフの公開ページ)。 */
  href?: string | null;
} | null;

/** 全画面の動き(背景のゆっくりした揺れ・光の粒子・波形・ハート)。動きを減らす設定の端末では止める。 */
const CSS = `
@keyframes shopAiSway {
  0% { transform: scale(1.04) translate3d(0, 0, 0) rotate(0deg); }
  33% { transform: scale(1.075) translate3d(-4px, -5px, 0) rotate(-0.35deg); }
  66% { transform: scale(1.065) translate3d(4px, -3px, 0) rotate(0.3deg); }
  100% { transform: scale(1.04) translate3d(0, 0, 0) rotate(0deg); }
}
@keyframes shopAiBokeh {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  15% { opacity: 0.75; }
  100% { transform: translate3d(var(--dx), -62dvh, 0); opacity: 0; }
}
@keyframes shopAiWave {
  0%, 100% { transform: scaleY(0.16); }
  50% { transform: scaleY(var(--amp, 1)); }
}
@keyframes shopAiHeart {
  0% { opacity: 0; transform: translateY(0) scale(0.6) rotate(0deg); }
  20% { opacity: 1; transform: translateY(-28px) scale(1.15) rotate(-8deg); }
  60% { opacity: 0.9; transform: translateY(-130px) scale(1) rotate(10deg); }
  100% { opacity: 0; transform: translateY(-240px) scale(0.85) rotate(-6deg); }
}
@media (prefers-reduced-motion: reduce) {
  .shop-ai-motion { animation: none !important; }
}
`;

function Avatar({ profile, size, active }: { profile: AiProfile; size: number; active?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {active && <span className="absolute inset-0 animate-ping rounded-full bg-hl-400/30" />}
      <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-hl-400/70 bg-gradient-to-br from-tone-800 to-black">
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
        ) : (
          <Sparkles className="text-hl-300" style={{ width: size * 0.45, height: size * 0.45 }} />
        )}
      </span>
    </span>
  );
}

/** 背景にゆっくり浮かぶ光の粒(暖色のボケ)。 */
function Bokeh() {
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        left: (i * 83) % 100,
        size: 14 + ((i * 37) % 30),
        dx: ((i % 5) - 2) * 14,
        delay: (i * 1.3) % 9,
        dur: 11 + ((i * 7) % 8),
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className="shop-ai-motion absolute rounded-full bg-hl-300/30 blur-xl"
          style={{ left: `${d.left}%`, bottom: "8%", width: d.size, height: d.size, ["--dx" as string]: `${d.dx}px`, animation: `shopAiBokeh ${d.dur}s linear ${d.delay}s infinite` }}
        />
      ))}
    </div>
  );
}

type WaveMode = "idle" | "listening" | "thinking" | "speaking";

/** 反応が分かる波形。話しかけている間(速く大きく)・考えている間(ゆっくり小さく)・話している間(中くらい)で動く。止まっているときは、細い線。 */
function Wave({ mode }: { mode: WaveMode }) {
  const bars = useMemo(() => Array.from({ length: 31 }, (_, i) => ({ delay: ((i * 53) % 100) / 100, k: 0.8 + ((i * 29) % 40) / 100 })), []);
  const amp = mode === "listening" ? 1 : mode === "speaking" ? 0.8 : 0.4;
  const dur = mode === "listening" ? 0.7 : mode === "speaking" ? 0.9 : 1.5;
  return (
    <div className="mx-auto flex h-9 items-center justify-center gap-[3px]" aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          className={`shop-ai-motion h-full w-[3px] origin-center rounded-full bg-gradient-to-t from-hl-500 to-hl-200 ${mode === "idle" ? "opacity-40" : "opacity-95"}`}
          style={
            mode === "idle"
              ? { transform: "scaleY(0.1)" }
              : { ["--amp" as string]: String(amp * b.k), animation: `shopAiWave ${dur * b.k}s ease-in-out ${b.delay}s infinite` }
          }
        />
      ))}
    </div>
  );
}

/**
 * 全画面のAIコンシェルジュ。顔の写真が背景いっぱいに出て、上の半分は顔と対面できる余白。
 * 会話は、下の半分に、半透明のガラス風で重ねる(直近の数往復だけ)。話す・考える・聞くの反応は、波形で分かる。
 * 画面を動かすときは、いったん畳まれ、「AIに戻る」で戻れる。
 */
export function ShopAiConcierge({ ai, shopName, profile, onClose, autoStartVoice }: { ai: Ai; shopName: string; profile: AiProfile; onClose: () => void; autoStartVoice?: boolean }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const l = ai.labels;
  const [infoOpen, setInfoOpen] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; icon: string }[]>([]);
  const bg = profile?.photoUrl ?? profile?.avatarUrl ?? null;
  const waveMode: WaveMode = ai.listening ? "listening" : ai.loading ? "thinking" : ai.speaking ? "speaking" : "idle";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      voiceOutput.cancel();
    };
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [ai.messages.length, ai.loading, ai.nav, ai.choices.length, ai.error]);

  const sendHeart = () => {
    const id = Date.now() + Math.random();
    const icons = ["💖", "💗", "💕", "✨"];
    setHearts((h) => [...h, { id, x: (Math.random() - 0.5) * 38, icon: icons[Math.floor(Math.random() * icons.length)] }]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1850);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-hidden bg-black" role="dialog" aria-modal="true" aria-label={l.conciergeName}>
      <style>{CSS}</style>

      {/* 背景: 顔の写真を全画面に。ゆっくり揺らして、動画のような生きた感じにする。 */}
      <div className="absolute inset-0 overflow-hidden">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="shop-ai-motion h-full w-full object-cover object-[center_22%]" style={{ animation: "shopAiSway 9s ease-in-out infinite" }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-panel-950 via-black to-black">
            <Sparkles className="h-24 w-24 text-hl-300/25" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-transparent" />
      </div>
      <Bokeh />

      {/* 上: 名前・いまの状態・店名(左) と 操作(右)。「AI」の印は、小さく残す。 */}
      <header className="relative z-30 flex items-start justify-between gap-2 px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 max-w-[68%] items-center gap-2.5 rounded-full border border-white/15 bg-black/40 py-1.5 pl-1.5 pr-3.5 shadow-lg backdrop-blur-xl">
          {/* 丸いアイコンをタップすると、そのキャスト・スタッフのページへ(会話は残り、「AIに戻る」で戻れる)。 */}
          {profile?.href ? (
            <button type="button" onClick={() => ai.go({ kind: "goto", path: profile.href! })} aria-label={`${profile.name}`} className="shrink-0 rounded-full transition active:scale-95">
              <Avatar profile={profile} size={36} />
            </button>
          ) : (
            <Avatar profile={profile} size={36} />
          )}
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13.5px] font-bold text-main">{profile?.name ? profile.name : l.conciergeName}</span>
              <span className="shrink-0 rounded bg-white/15 px-1 py-px text-[9px] font-bold tracking-wide text-hl-300">{l.aiBadge}</span>
              {profile?.badge && <span className="shrink-0 text-[10px] font-semibold text-hl-300">👑 {profile.badge}</span>}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-main/75">
              {profile?.status && (
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {profile.status}
                </span>
              )}
              <span className="truncate">{shopName}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {voiceOutput.supported() && (
            <button type="button" onClick={() => ai.setSpeakOn(!ai.speakOn)} aria-pressed={ai.speakOn} aria-label={l.speak} className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/15 backdrop-blur-xl ${ai.speakOn ? "bg-hl-400/30 text-hl-200" : "bg-black/40 text-main/80"}`}>
              {ai.speakOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          )}
          <button type="button" onClick={() => setInfoOpen((v) => !v)} aria-label={l.infoTitle} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-main/80 backdrop-blur-xl">
            <Info className="h-4 w-4" />
          </button>
          {ai.messages.length > 0 && (
            <button type="button" onClick={ai.clear} aria-label={l.clear} title={l.clear} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-main/80 backdrop-blur-xl">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={l.close} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-main backdrop-blur-xl">
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ⓘ: AIであること・答えの根拠(控えめな案内) */}
      {infoOpen && (
        <div className="absolute inset-x-4 top-24 z-40 rounded-2xl border border-white/15 bg-black/70 p-3.5 text-xs leading-relaxed text-main/90 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="mb-1 font-bold text-hl-300">{l.infoTitle}</p>
              <p>{l.info}</p>
            </div>
            <button type="button" onClick={() => setInfoOpen(false)} aria-label={l.close} className="shrink-0 p-1 text-main/60 hover:text-main">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 下の半分: 半透明のグラデーションに、会話・カード・入力欄を重ねる(上の半分は、顔が見えるよう、何も置かない) */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-[#0c0a12]/95 via-[#0c0a12]/75 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-24">
        {/* ハートが舞う */}
        <div className="pointer-events-none absolute bottom-24 right-5 z-30 h-64 w-16 overflow-visible" aria-hidden>
          {hearts.map((h) => (
            <span key={h.id} className="shop-ai-motion absolute bottom-0 text-2xl drop-shadow-[0_4px_12px_rgba(244,63,94,0.5)]" style={{ left: `${20 + h.x}px`, animation: "shopAiHeart 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}>
              {h.icon}
            </span>
          ))}
        </div>

        <Wave mode={waveMode} />

        <div ref={listRef} className="max-h-[34dvh] space-y-2 overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ai.messages.length === 0 && (
            <div className="px-4">
              <p className="max-w-[88%] rounded-2xl border border-hl-400/30 bg-black/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-main shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-xl">{l.welcome}</p>
            </div>
          )}
          <ShopAiMessages ai={ai} limit={6} glass />
        </div>

        <div className="pt-1">
          <ShopAiInput
            ai={ai}
            showChips
            glass
            autoStartVoice={autoStartVoice}
            rightSlot={
              <button type="button" onClick={sendHeart} aria-label={l.heart} className="rounded-full border border-rose-300/40 bg-rose-500/25 p-2 text-rose-300 transition active:scale-90">
                <Heart className="h-4 w-4 fill-current" />
              </button>
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 「このお店のことを聞いてください」のバー。顔のアイコンつき。タップすると、全画面のコンシェルジュが開く。 */
export function ShopAiLauncher({ profile, label, onOpen }: { profile: AiProfile; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-full border border-main/15 bg-panel-950/95 py-1.5 pl-1.5 pr-4 text-left shadow-xl backdrop-blur-xl"
    >
      <Avatar profile={profile} size={32} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-tone-400">{label}</span>
      <Sparkles className="h-4 w-4 shrink-0 text-hl-300" />
    </button>
  );
}

/**
 * 店舗詳細ページ用: 画面下に常駐するバー。タップすると全画面のコンシェルジュが開く。
 * コンシェルジュが画面を動かして(在籍一覧など)閉じたあとは、「AIに戻る」ボタンを出す。
 */
export function ShopAiDock({ shopId, shopName, profile }: { shopId: string; shopName: string; profile: AiProfile }) {
  const [open, setOpen] = useState(false);
  const [returnable, setReturnable] = useState(false);
  // 画面を動かすときは、会話画面を畳んで、「AIに戻る」ボタンを出す。
  const ai = useShopAi(shopId, {
    onLeave: () => {
      setOpen(false);
      setReturnable(true);
    },
  });
  useEffect(() => {
    setReturnable(consumeAiReturn(shopId));
  }, [shopId]);

  const openIt = () => {
    clearAiReturn(shopId);
    setReturnable(false);
    setOpen(true);
  };

  return (
    <>
      {/* 右下にはサイト全体のAIのボタンがあるので、スマホでは右に余白を空けて重ならないようにする。 */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[55] px-3 md:bottom-4">
        <div className="mx-auto max-w-xl space-y-2 pr-14 md:pr-0">
          {returnable && !open && (
            <button type="button" onClick={openIt} className="flex items-center gap-2 rounded-full bg-cta-light px-4 py-2 text-sm font-bold text-on-cta-gold shadow-xl shadow-hl-500/20 transition hover:bg-cta-hover">
              <Sparkles className="h-4 w-4" />
              {ai.labels.back}
            </button>
          )}
          <ShopAiLauncher profile={profile} label={ai.labels.dockPlaceholder} onOpen={openIt} />
        </div>
      </div>
      {open && <ShopAiConcierge ai={ai} shopName={shopName} profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}
