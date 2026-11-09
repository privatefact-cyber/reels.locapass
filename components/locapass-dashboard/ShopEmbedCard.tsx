import { CopyButton } from "@/components/locapass-dashboard/CopyButton";

/**
 * 店舗の公式サイトに貼れる「LOCAPASS認証バッジ + 最新リール」の埋め込みコード(public/embed/shop-widget.js)。
 * 貼るだけで、リールが増えるたびに自動で更新される。
 */
export function ShopEmbedCard({ shopCode }: { shopCode: string }) {
  const snippet = `<div class="locapass-shop-widget" data-shop="${shopCode}"></div>\n<script src="https://locapass.net/embed/shop-widget.js" defer></script>`;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">公式サイトに貼る「LOCAPASS認証」ウィジェット</h2>
      <p className="mb-2 text-xs text-slate-500">
        お店のホームページに下のコードを貼ると、「LOCAPASS認証」バッジと最新のリール動画が表示されます。リールを投稿するたびに自動で更新され、見た人はここからLOCAPASSの店舗ページへ移動できます。
      </p>
      <div className="flex max-w-xl items-start gap-2">
        <textarea
          readOnly
          rows={3}
          value={snippet}
          className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 text-slate-900"
        />
        <CopyButton value={snippet} />
      </div>
    </section>
  );
}
