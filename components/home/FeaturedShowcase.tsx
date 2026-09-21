"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { FeaturedShop } from "@/components/home/FeaturedHero";

/**
 * ヒーローの下に置く、提携店舗のコンパクトな横スクロールカルーセル。
 *
 * 以前は1店舗ぶんが写真+料金表の全明細+紹介文全文で画面をほぼ1店舗で占有し、
 * 「個別詳細ページが並んでいるようだ」という指摘を受けた。ここでは:
 * - 紹介文は最大2行まで(それ以上は店舗ページで)
 * - 料金は代表の1行だけ(セット◯円〜。明細は店舗ページで)
 * - 縦積みではなく横スクロールのカードにして、1画面で複数店舗が見えるようにする
 *
 * labels(t.featured)は関数を含むため、サーバーコンポーネントからpropsで渡さずuseLocale()で自前取得する。
 */
export function FeaturedShowcase({ shops }: { shops: FeaturedShop[] }) {
  const { t } = useLocale();
  const labels = t.featured;
  if (shops.length === 0) return null;

  return (
    <section className="py-8 md:py-12">
      <div className="mx-auto max-w-[1400px] px-6 md:px-14">
        <p className="flex items-center gap-4 font-display text-[11px] uppercase tracking-[0.55em] text-gold">
          <span className="h-px w-10 bg-gold/70" />
          {labels.featured}
        </p>
        <p className="mt-3 max-w-md font-mincho text-xs leading-[1.9] text-white/60">{labels.featuredLead}</p>
      </div>

      <div className="mt-6 flex gap-4 overflow-x-auto px-6 pb-2 snap-x snap-mandatory [scrollbar-width:none] md:px-14 [&::-webkit-scrollbar]:hidden">
        {shops.map((shop, i) => (
          <Link
            key={shop.id}
            href={`/images/no-image.jpg
            className="group w-[190px] shrink-0 snap-start sm:w-[220px]"
          >
            <div className="relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shop.imageUrl}
                alt={shop.name}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-2 border border-gold/0 transition-colors duration-500 group-hover:border-gold/50" />
              <span className="absolute left-2 top-2 font-display text-[11px] tracking-[0.2em] text-gold/90">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <p className="mt-3 truncate font-mincho text-[10px] tracking-[0.2em] text-white/50">{shop.meta}</p>
            <h3 className="mt-1 truncate font-display text-lg font-medium uppercase tracking-[0.03em] text-white">
              {shop.name}
            </h3>
            {/* 紹介文は最大2行まで。明細・全文は店舗ページ側で見せる。 */}
            {shop.description && (
              <p className="mt-1.5 line-clamp-2 font-mincho text-[11px] leading-[1.7] text-white/60">
                {shop.description}
              </p>
            )}
            {/* 代表価格1行のみ(料金表の全明細は出さない)。 */}
            {shop.setPriceFrom !== null && (
              <p className="mt-2 font-display text-xs tracking-[0.15em] text-gold">
                {labels.setFrom(shop.setPriceFrom.toLocaleString())}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
