"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPhotoShopLink } from "@/app/dashboard/shop/[shopId]/photos/actions";

type Item = { id: string; imageUrl: string; spotName: string; userName: string; createdAt: string };

function Card({ item, children }: { item: Item; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" style={{ pointerEvents: "auto" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{item.spotName}</p>
        <p className="truncate text-xs text-slate-500">
          {item.userName} ・ {item.createdAt.slice(0, 10)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      </div>
    </li>
  );
}

export function ShopPhotoLinkManager({
  shopId,
  canAttach,
  shown,
  hidden,
  candidates,
}: {
  shopId: string;
  canAttach: boolean;
  shown: (Item & { attached: boolean })[];
  hidden: Item[];
  candidates: Item[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function run(postId: string, mode: "attach" | "hide" | "clear") {
    setError(null);
    startTransition(async () => {
      try {
        await setPhotoShopLink(shopId, postId, mode);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  const btn = "rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
  const q = query.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => `${c.spotName} ${c.userName}`.toLowerCase().includes(q)) : candidates;

  return (
    <div className="space-y-8">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">店舗ページに出ている写真({shown.length})</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">いま、店舗ページに出ている写真はありません。</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((p) => (
              <Card key={p.id} item={p}>
                {p.attached && <span className="rounded bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">管理者が追加</span>}
                {p.attached && canAttach ? (
                  <button type="button" disabled={pending} onClick={() => run(p.id, "clear")} className={`${btn} border-slate-300 text-slate-700`}>
                    追加を解除
                  </button>
                ) : null}
                <button type="button" disabled={pending} onClick={() => run(p.id, "hide")} className={`${btn} border-red-300 text-red-700`}>
                  この店舗では出さない
                </button>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">この店舗では出さない写真({hidden.length})</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {hidden.map((p) => (
              <Card key={p.id} item={p}>
                <button type="button" disabled={pending} onClick={() => run(p.id, "clear")} className={`${btn} border-slate-300 text-slate-700`}>
                  元に戻す
                </button>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {canAttach && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">ほかの写真をこの店舗に表示する</h2>
          <p className="text-xs text-slate-500">このエリアに投稿された最新の写真(80枚まで)のうち、いま出ていないものです。場所名の表記が違って自動で紐付かなかった写真を、ここから追加できます。</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="場所名・投稿者で絞り込み"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">候補の写真はありません。</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {filtered.map((p) => (
                <Card key={p.id} item={p}>
                  <button type="button" disabled={pending} onClick={() => run(p.id, "attach")} className={`${btn} border-indigo-300 text-indigo-700`}>
                    この店舗に表示する
                  </button>
                </Card>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
