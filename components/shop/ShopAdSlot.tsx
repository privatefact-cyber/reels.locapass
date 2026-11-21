import Link from "@/components/i18n/LocaleLink";
import type { ReactNode } from "react";
import { AdCarousel } from "@/components/shop/AdCarousel";
import { AdSlotTracker } from "@/components/shop/AdSlotTracker";
import { AD_SLOT_SIZES, type AdSlotMode, type AdSlotPosition } from "@/lib/recommend/adSlots";
import type { AdCreative } from "@/lib/recommend/adCreatives";
import { resizedUrl } from "@/lib/images/imgUrl";

/**
 * 広告枠(lib/recommend/adSlots.ts)。無料掲載の店舗ページだけで使う(有料掲載では呼び出し側が mode="off" にする)。
 *  - placeholder: 場所確認用のダミー
 *  - live       : 自社の中身(lib/recommend/adCreatives.ts)を出し、表示とタップを記録する。ラベル(PR/お知らせ/特集)を必ず付ける。
 * 外部広告のタグを入れるときは、live の中身をこのコンポーネント内で差し替える。
 */
/** 内部リンク(/ から始まる)はロケール付きのリンク、外部(https)は別タブで開く。 */
function AdLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (/^https:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer sponsored" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** 画像つきカードの画像(横長)。サイズを変えられる画像は軽い版にし、変えられないURLはそのまま使う。 */
function wideImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return resizedUrl(url, { width: 640, height: 335, fit: "cover", quality: 75 }) ?? url;
}

/** 上の枠・下の枠で使うカード。画像があれば大きく見せ(上の枠=上半分、下の枠=左側)、無ければ文字だけの形にする。 */
function AdCard({ creative, position, size }: { creative: AdCreative; position: AdSlotPosition; size: { width: number; height: number } }) {
  const img = wideImage(creative.imageUrl);
  const labelChip = "inline-block rounded bg-tone-500/30 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-tone-200";
  const frame = "h-full w-full overflow-hidden rounded-xl border border-tone-500/40 bg-panel-900/60";

  if (img && position === "bottom") {
    return (
      <aside aria-label={creative.label} data-ad-slot={position} className={frame} style={{ minHeight: size.height }}>
        <AdLink href={creative.href} className="flex h-full min-h-[inherit] items-stretch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" loading="lazy" decoding="async" width={1200} height={628} className="w-[42%] shrink-0 object-cover" />
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 p-3">
            <div className="space-y-0.5">
              <span className={labelChip}>{creative.label}</span>
              <p className="line-clamp-2 text-sm font-bold text-tone-100">{creative.title}</p>
            </div>
            <span className="self-end text-xs font-semibold text-tone-200 underline">{creative.cta} →</span>
          </div>
        </AdLink>
      </aside>
    );
  }

  if (img) {
    return (
      <aside aria-label={creative.label} data-ad-slot={position} className={frame}>
        <AdLink href={creative.href} className="flex h-full flex-col">
          <div className="relative w-full" style={{ aspectRatio: "1200 / 628" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" loading="lazy" decoding="async" width={1200} height={628} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">{creative.label}</span>
          </div>
          <div className="flex flex-1 flex-col justify-between gap-1.5 p-3">
            <div className="space-y-0.5">
              <p className="line-clamp-2 text-sm font-bold text-tone-100">{creative.title}</p>
              {creative.sub && <p className="line-clamp-2 text-xs text-tone-300">{creative.sub}</p>}
            </div>
            <span className="self-end text-xs font-semibold text-tone-200 underline">{creative.cta} →</span>
          </div>
        </AdLink>
      </aside>
    );
  }

  return (
    <aside aria-label={creative.label} data-ad-slot={position} className={frame} style={{ minHeight: size.height }}>
      <AdLink href={creative.href} className="flex h-full min-h-[inherit] flex-col justify-between gap-2 p-3">
        <div className="space-y-0.5">
          <span className={labelChip}>{creative.label}</span>
          <p className="line-clamp-2 text-sm font-bold text-tone-100">{creative.title}</p>
          {creative.sub && <p className="line-clamp-3 text-xs text-tone-300">{creative.sub}</p>}
        </div>
        <span className="self-end text-xs font-semibold text-tone-200 underline">{creative.cta} →</span>
      </AdLink>
    </aside>
  );
}

export function ShopAdSlot({
  position,
  mode,
  creative,
  creatives,
  shopId,
  locale,
}: {
  position: AdSlotPosition;
  mode: AdSlotMode;
  /** 下の枠: 1枚の横長バナー */
  creative?: AdCreative | null;
  /** 上の枠: 横スライドで並べるカード */
  creatives?: AdCreative[];
  shopId?: string;
  locale?: string;
}) {
  if (mode === "off") return null;
  const size = AD_SLOT_SIZES[position];

  if (mode === "live") {
    if (!shopId) return null;
    const list = position === "mid" ? (creatives ?? []) : creative ? [creative] : [];
    if (list.length === 0) return null;
    // 上の枠は、カードの高さを小さめに(中身に合わせる)。レイアウトのずれを防ぐため最小の高さだけ確保する。
    const cardSize = position === "mid" ? { width: size.width, height: 132 } : size;
    if (position === "mid" && list.length >= 2) {
      return (
        <AdCarousel count={list.length}>
          {list.map((c) => (
            <AdSlotTracker key={c.id} slot={position} creative={c.id} shopId={shopId} locale={locale ?? "ja"} className="w-[78%] max-w-[320px] shrink-0 snap-start">
              <AdCard creative={c} position={position} size={cardSize} />
            </AdSlotTracker>
          ))}
        </AdCarousel>
      );
    }
    const only = list[0];
    return (
      <AdSlotTracker slot={position} creative={only.id} shopId={shopId} locale={locale ?? "ja"} className="mx-auto w-full" >
        <div className="mx-auto w-full" style={{ maxWidth: size.width }}>
          <AdCard creative={only} position={position} size={cardSize} />
        </div>
      </AdSlotTracker>
    );
  }

  return (
    <aside
      aria-label="広告"
      data-ad-slot={position}
      className="mx-auto flex w-full items-center justify-center rounded-xl border border-dashed border-tone-500/60 bg-panel-900/40 text-center"
      style={{ maxWidth: size.width, minHeight: size.height }}
    >
      <div className="space-y-0.5 px-3 py-2">
        <p className="text-[10px] font-bold tracking-widest text-tone-400">AD</p>
        <p className="text-xs text-tone-300">広告枠({size.label})</p>
        <p className="text-[10px] text-tone-500">
          {size.width}×{size.height} · {position === "mid" ? "基本情報の下" : "ページ最下部"} · ダミー表示
        </p>
      </div>
    </aside>
  );
}
