import Link from "@/components/i18n/LocaleLink";
import { AdSlotTracker } from "@/components/shop/AdSlotTracker";
import { AD_SLOT_SIZES, type AdSlotMode, type AdSlotPosition } from "@/lib/recommend/adSlots";
import type { AdCreative } from "@/lib/recommend/adCreatives";
import { gridThumb } from "@/lib/images/thumb";

/**
 * 広告枠(lib/recommend/adSlots.ts)。無料掲載の店舗ページだけで使う(有料掲載では呼び出し側が mode="off" にする)。
 *  - placeholder: 場所確認用のダミー
 *  - live       : 自社の中身(lib/recommend/adCreatives.ts)を出し、表示とタップを記録する。ラベル(PR/お知らせ/特集)を必ず付ける。
 * 外部広告のタグを入れるときは、live の中身をこのコンポーネント内で差し替える。
 */
export function ShopAdSlot({
  position,
  mode,
  creative,
  shopId,
  locale,
}: {
  position: AdSlotPosition;
  mode: AdSlotMode;
  creative?: AdCreative | null;
  shopId?: string;
  locale?: string;
}) {
  if (mode === "off") return null;
  const size = AD_SLOT_SIZES[position];

  if (mode === "live") {
    if (!creative || !shopId) return null;
    const thumb = gridThumb(creative.imageUrl);
    return (
      <AdSlotTracker slot={position} creative={creative.id} shopId={shopId} locale={locale ?? "ja"}>
        <aside
          aria-label={creative.label}
          data-ad-slot={position}
          className="mx-auto w-full overflow-hidden rounded-xl border border-tone-500/40 bg-panel-900/60"
          style={{ maxWidth: size.width, minHeight: size.height }}
        >
          <Link href={creative.href} className="flex h-full min-h-[inherit] flex-col justify-between gap-2 p-3">
            <div className="flex items-start gap-2">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 space-y-0.5">
                <span className="inline-block rounded bg-tone-500/30 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-tone-200">{creative.label}</span>
                <p className="line-clamp-2 text-sm font-bold text-tone-100">{creative.title}</p>
                {creative.sub && <p className="line-clamp-3 text-xs text-tone-300">{creative.sub}</p>}
              </div>
            </div>
            <span className="self-end text-xs font-semibold text-tone-200 underline">{creative.cta} →</span>
          </Link>
        </aside>
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
