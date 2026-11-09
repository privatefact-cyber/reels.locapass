"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShopSocialRepost } from "@/app/dashboard/shop/[shopId]/today/actions";

/** 「LOCAPASS公式SNSでの紹介」。オンにすると、この店のリールを、LOCAPASS公式のThreadsで紹介することがあります(既定はオフ)。 */
export function SocialRepostOption({ shopId, initialEnabled }: { shopId: string; initialEnabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState<string | null>(null);

  function save(next: boolean) {
    setMessage(null);
    setEnabled(next);
    startTransition(async () => {
      try {
        await updateShopSocialRepost(shopId, next);
        setMessage(next ? "オンにしました。" : "オフにしました。");
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">LOCAPASS公式SNSでの紹介</h2>
      <p className="text-xs text-slate-500">
        オンにすると、この店が投稿したリールの画像と紹介文、店名、リールへのリンクを、LOCAPASS公式のThreadsで紹介することがあります。お店への新しいお客様との出会いが増える可能性があります。いつでもオフにできます(すでに投稿されたものは、LOCAPASS運営に連絡してください)。
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => save(e.target.checked)} className="h-4 w-4" />
        公式SNSでの紹介を許可する
      </label>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </section>
  );
}
