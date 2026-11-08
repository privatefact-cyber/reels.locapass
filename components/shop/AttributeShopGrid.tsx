"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import Link from "@/components/i18n/LocaleLink";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { ShopMediaFallback } from "@/components/shop/ShopMediaFallback";
import { gridThumb } from "@/lib/images/thumb";
import { shopPath } from "@/lib/locapass/publicUrls";
import type { Locale } from "@/lib/i18n/locale";
import type { ShopGridItem } from "@/lib/reels/types";

const TEXT: Record<Locale, { back: string; placeholder: string; count: (n: number) => string; empty: string; noMatch: string; search: string }> = {
  ja: { back: "戻る", placeholder: "住所で絞り込み(例: 水戸市)", count: (n) => `${n}店舗`, empty: "この条件の店舗はまだありません。", noMatch: "その住所の店舗はありません。", search: "住所で絞り込み" },
  en: { back: "Back", placeholder: "Filter by address (e.g. Shibuya)", count: (n) => `${n} ${n === 1 ? "shop" : "shops"}`, empty: "No shops yet.", noMatch: "No shops at that address.", search: "Filter by address" },
  zh: { back: "返回", placeholder: "按地址筛选(例:涩谷)", count: (n) => `${n} 家店铺`, empty: "暂无店铺。", noMatch: "该地址没有店铺。", search: "按地址筛选" },
  ar: { back: "رجوع", placeholder: "تصفية حسب العنوان", count: (n) => `${n} متجر`, empty: "لا توجد متاجر بعد.", noMatch: "لا توجد متاجر في هذا العنوان.", search: "تصفية حسب العنوان" },
};

/** 全角/半角・大小文字・空白・ハイフン類の違いで取りこぼさないよう、住所を比べやすい形にそろえる。 */
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s　\-ー−‐‑–—]/g, "");
}

/**
 * 属性タグ(ペット同伴可など)の店舗一覧。トップページの店舗グリッドと同じ3列の可変グリッドで、
 * 虫眼鏡から、一覧の店舗だけを住所で絞り込める。タップすると店舗ページへ。
 */
export function AttributeShopGrid({ icon, label, shops }: { icon: string; label: string; shops: ShopGridItem[] }) {
  const { locale } = useLocale();
  const tx = TEXT[locale] ?? TEXT.ja;
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  const terms = useMemo(() => keyword.normalize("NFKC").split(/[\s　]+/).map(norm).filter(Boolean), [keyword]);
  const filtered = useMemo(
    () => (terms.length === 0 ? shops : shops.filter((s) => { const a = norm(s.address ?? ""); return terms.every((t) => a.includes(t)); })),
    [shops, terms],
  );

  return (
    <div className="space-y-2">
      <div className="sticky top-[calc(81px+env(safe-area-inset-top))] z-30 border-b border-main/5 bg-tone-950/90 px-1 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label={tx.back} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tone-700 text-tone-300 transition hover:border-accent hover:text-accent">
            <ArrowLeft size={16} className="rtl:rotate-180" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-main">
            <span aria-hidden>{icon}</span> {label}
            <span className="ms-2 text-xs font-normal text-tone-400">{tx.count(filtered.length)}</span>
          </h1>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={tx.search}
            aria-expanded={searchOpen}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition hover:border-accent hover:text-accent ${
              searchOpen || keyword ? "border-accent text-accent" : "border-tone-700 text-tone-300"
            }`}
          >
            <Search size={16} />
          </button>
        </div>
        {searchOpen && (
          <div className="mt-2 flex items-center gap-2 rounded-full border border-tone-700 bg-main/5 px-3 py-2">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              autoFocus
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={tx.placeholder}
              className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {shops.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-tone-500">{tx.empty}</p>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-tone-500">{tx.noMatch}</p>
      ) : (
        // トップの店舗グリッドと同じ列数(列数は偶数に揃える決まりのため、3列のあとは4・6・8列)。
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {filtered.map((s) => (
            <ShopTile key={s.id} shop={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopTile({ shop }: { shop: ShopGridItem }) {
  const [broken, setBroken] = useState(false);
  const thumb = gridThumb(shop.coverImageUrl);
  return (
    <Link
      href={shopPath(shop.portalSlug, shop.slug)}
      data-surface="media"
      className="group relative block aspect-square w-full overflow-hidden rounded-none bg-panel-900 text-left"
    >
      {thumb && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full transform-gpu object-cover transition duration-300 will-change-transform group-hover:scale-105 group-hover:brightness-110"
        />
      ) : (
        <span className="relative block h-full w-full overflow-hidden bg-panel-900">
          <ShopMediaFallback category={shop.genre} seed={shop.id} name={shop.name} showCredit={false} thumb />
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-main/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-main">SHOP</span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4">
        <span dir="auto" className="block truncate text-[11px] font-semibold text-main drop-shadow">{shop.name}</span>
      </span>
    </Link>
  );
}
