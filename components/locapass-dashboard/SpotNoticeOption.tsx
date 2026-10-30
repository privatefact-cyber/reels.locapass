"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShopSpotNotice } from "@/app/dashboard/shop/[shopId]/today/actions";

/** オプション「開催場所のお知らせ」。譲渡会・イベントなどの開催場所を、店舗ページと地図に出せるようにする(既定はオフ)。 */
export function SpotNoticeOption({ shopId, initialEnabled }: { shopId: string; initialEnabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState<string | null>(null);

  function save(next: boolean) {
    setMessage(null);
    setEnabled(next);
    startTransition(async () => {
      try {
        await updateShopSpotNotice(shopId, next);
        setMessage(next ? "オンにしました。上のメニューに「開催場所」が出ます。" : "オフにしました。");
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">オプション:開催場所のお知らせ</h2>
      <p className="text-sm text-slate-600">
        譲渡会やイベントなど、場所が変わる開催をお知らせできます。オンにすると、開催予定を登録する欄がメニューに出て、店舗ページの「次の開催」とカレンダー、地図のピンに表示されます。
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => save(e.target.checked)} className="h-4 w-4" />
        開催場所のお知らせを使う
      </label>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </section>
  );
}
