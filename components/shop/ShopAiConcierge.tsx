"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Sparkles, Volume2, VolumeX } from "lucide-react";
import { ShopAiInput, ShopAiMessages, clearAiReturn, consumeAiReturn, useShopAi, voiceOutput, type Ai } from "@/components/shop/ShopAiChat";

/** 会話画面に出す「顔」。店舗が選んだ店長などスタッフ、または店舗が設定したキャラクターの画像(本人の承諾が確認できたものだけ)。無いときはAIのアイコン。 */
export type AiProfile = { name: string; avatarUrl: string | null } | null;

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

/** 全画面のAIコンシェルジュ。顔が見え、声と文字で話せる。画面を動かすときは、いったん畳まれ、「AIに戻る」で戻れる。 */
export function ShopAiConcierge({ ai, shopName, profile, onClose, autoStartVoice }: { ai: Ai; shopName: string; profile: AiProfile; onClose: () => void; autoStartVoice?: boolean }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const l = ai.labels;

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

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-gradient-to-b from-panel-950 via-black to-black" role="dialog" aria-modal="true" aria-label={l.conciergeName}>
      {/* 上: 店名と閉じる */}
      <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="truncate text-xs text-tone-400">{shopName}</span>
        <button type="button" onClick={onClose} aria-label={l.close} className="rounded-full bg-main/10 p-1.5 text-main hover:bg-main/20">
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      {/* 顔 */}
      <div className="flex shrink-0 flex-col items-center gap-2 pb-3 pt-1">
        <Avatar profile={profile} size={112} active={ai.loading || ai.speaking} />
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-main">{profile?.name ? profile.name : l.conciergeName}</p>
          <span className="rounded bg-hl-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-hl-300">{l.aiBadge}</span>
        </div>
        {profile?.name && <p className="text-[11px] text-tone-500">{l.conciergeName}</p>}
      </div>

      {/* 会話 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">
        {ai.messages.length === 0 && (
          <div className="px-4">
            <p className="max-w-[88%] rounded-2xl border border-hl-400/30 bg-panel-950 px-3 py-2 text-sm leading-relaxed text-tone-200">{l.welcome}</p>
          </div>
        )}
        <ShopAiMessages ai={ai} />
      </div>

      {/* 下: 入力(声・文字)と読み上げの切り替え */}
      <div className="shrink-0 space-y-2 border-t border-main/10 px-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-between px-4">
          <p className="min-w-0 flex-1 pr-2 text-[10px] leading-tight text-tone-500">{l.note}</p>
          {voiceOutput.supported() && (
            <button type="button" onClick={() => ai.setSpeakOn(!ai.speakOn)} aria-pressed={ai.speakOn} className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] ${ai.speakOn ? "bg-hl-400/20 text-hl-300" : "text-tone-400"}`}>
              {ai.speakOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {l.speak}
            </button>
          )}
        </div>
        <ShopAiInput ai={ai} showChips autoStartVoice={autoStartVoice} />
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
