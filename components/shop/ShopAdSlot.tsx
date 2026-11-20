import { AD_SLOT_SIZES, type AdSlotMode, type AdSlotPosition } from "@/lib/recommend/adSlots";

/**
 * 広告枠の土台(lib/recommend/adSlots.ts)。いまはレイアウト確認用のダミーだけを出す。
 * 無料掲載の店舗ページだけで使う(有料掲載では呼び出し側が mode="off" にする)。
 * 広告の中身を入れるときは、このコンポーネントのダミー部分を差し替える。
 */
export function ShopAdSlot({ position, mode }: { position: AdSlotPosition; mode: AdSlotMode }) {
  if (mode !== "placeholder") return null;
  const size = AD_SLOT_SIZES[position];
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
