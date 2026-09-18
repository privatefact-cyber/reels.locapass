"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

export type FeaturedShop = {
  id: string;
  name: string;
  /** 「六本木 · キャバクラ」のような表示用の1行(言語に応じて翻訳済み)。 */
  meta: string;
  imageUrl: string;
  description: string | null;
  businessHours: string | null;
  /** 最安のセット料金(円)。料金表が無ければnull。 */
  setPriceFrom: number | null;
  /** 上位の料金(セット・VIP等)を最大3件。FEATURED枠で使う。 */
  highlights: { name: string; durationMinutes: number | null; price: number }[];
  area: string | null;
};

/** 自動で次の店舗に切り替えるまでの時間(ms)。 */
const SLIDE_MS = 6500;

/**
 * トップページのヒーロー。提携店舗(shops.featured_rank)の写真を全面に敷き、黒×ゴールドで見せる。
 *
 * デザインの約束事(量産テンプレに見せないため):
 * - 角丸・ドロップシャドウ・色つきグラデーションは使わない。色は黒・白・ゴールドの3色だけ
 * - 英字はCormorant Garamond(字間広め)、和文は明朝体。装飾はゴールドの細い罫線だけ
 * - 写真は薄くゆっくり寄っていく(動きは控えめ。視差を減らす設定の端末では止める)
 *
 * labels(t.featured)は関数を含むため、サーバーコンポーネント(app/page.tsx)からpropsで
 * 渡さずuseLocale()で自前取得する(関数はサーバー→クライアントのprops境界を越えられない)。
 *
 * 高さ・文字量はあえて控えめにしてある(1店舗が画面を占有して下の通常一覧に辿り着けない、
 * という指摘を受けて調整した)。紹介文は必ず2行までに切り、料金は代表の1行のみ出す。
 */
export function FeaturedHero({ shops, onDismiss }: { shops: FeaturedShop[]; onDismiss?: () => void }) {
  const { t } = useLocale();
  const labels = t.featured;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = shops.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count, go]);

  if (count === 0) return null;
  const current = shops[index];

  return (
    <section
      className="relative h-[58svh] min-h-[420px] max-h-[640px] w-full overflow-hidden bg-black md:h-[64vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchStartX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        go(end < start ? index + 1 : index - 1);
      }}
      aria-roledescription="carousel"
    >
      {shops.map((shop, i) => (
        <div
          key={shop.id}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-[1400ms] ease-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shop.imageUrl}
            alt={shop.name}
            loading={i === 0 ? "eager" : "lazy"}
            className={`h-full w-full object-cover transition-transform duration-[8000ms] ease-out motion-reduce:transition-none ${
              i === index ? "scale-100" : "scale-[1.08]"
            }`}
          />
        </div>
      ))}

      {/* 文字を読ませるための暗幕(下と左だけ。写真の良さを潰さない) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/20" />
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/70 via-black/10 to-transparent md:block" />

      {/* 非表示ボタン(セッション中だけ記憶。この枠を消したい人のための逃げ道)。 */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.common.close}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white md:right-6 md:top-6"
        >
          <X size={16} />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-[1400px] px-6 pb-8 md:px-14 md:pb-10">
          <div key={current.id} className="animate-[luxelaFadeUp_900ms_ease-out_both]">
            <p className="flex items-center gap-4 font-display text-[11px] uppercase tracking-[0.55em] text-gold">
              <span className="h-px w-10 bg-gold/70" />
              {labels.pickUp}
            </p>
            <p className="mt-4 font-mincho text-[11px] tracking-[0.25em] text-white/60 md:text-xs">{current.meta}</p>
            <h2 className="mt-2 font-display text-[2.2rem] font-medium uppercase leading-[0.95] tracking-[0.06em] text-white md:text-6xl">
              {current.name}
            </h2>
            {/* 紹介文は最大2行まで(詳細は「店舗を見る」の先の店舗ページで見せる)。 */}
            {current.description && (
              <p className="mt-4 line-clamp-2 max-w-xl font-mincho text-[13px] leading-[1.9] text-white/75 md:text-[15px]">
                {current.description}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[0.15em] text-white/60">
              {current.setPriceFrom !== null && (
                <span className="font-display text-sm tracking-[0.2em] text-gold">
                  {labels.setFrom(current.setPriceFrom.toLocaleString())}
                </span>
              )}
              {current.setPriceFrom !== null && current.businessHours && <span className="h-3 w-px bg-white/25" />}
              {current.businessHours && (
                <span className="font-mincho">
                  {labels.hours} {current.businessHours}
                </span>
              )}
            </div>

            <div className="mt-6 flex items-center gap-7">
              <Link
                href={`/shops/${current.id}`}
                className="border border-gold/80 px-8 py-3.5 font-display text-[11px] uppercase tracking-[0.4em] text-gold transition-colors duration-300 hover:bg-gold hover:text-black"
              >
                {labels.viewShop}
              </Link>
              <Link
                href="/map"
                className="group flex items-center gap-3 font-display text-[11px] uppercase tracking-[0.4em] text-white/70 transition-colors hover:text-white"
              >
                {labels.viewMap}
                <span className="h-px w-8 bg-white/40 transition-all duration-300 group-hover:w-12 group-hover:bg-white" />
              </Link>
            </div>
          </div>

          {count > 1 && (
            <div className="mt-8 flex items-center gap-6">
              <span className="font-display text-xs tracking-[0.3em] text-white/70">
                <span className="text-gold">{String(index + 1).padStart(2, "0")}</span>
                <span className="mx-2 text-white/30">/</span>
                {String(count).padStart(2, "0")}
              </span>
              <div className="flex gap-2">
                {shops.map((shop, i) => (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={shop.name}
                    className="relative h-6 w-12 md:w-16"
                  >
                    <span className="absolute inset-x-0 top-1/2 h-px bg-white/25" />
                    <span
                      key={`${shop.id}-${index}-${paused}`}
                      className={`absolute left-0 top-1/2 h-px bg-gold ${
                        i < index ? "w-full" : i === index ? (paused ? "w-full" : "animate-[luxelaProgress_linear_both]") : "w-0"
                      }`}
                      style={i === index && !paused ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
