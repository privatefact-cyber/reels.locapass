import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { BoostLaunchForm } from "@/components/boost/BoostLaunchForm";
import { BoostEndButton } from "@/components/boost/BoostEndButton";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; discount_tag: string | null; status: string; created_at: string; expires_at: string };

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

export default async function ShopBoostPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = await createClient();
  const [{ data: shopRow }, { data: rows }] = await Promise.all([
    supabase.from("locapass_shops").select("cover_url").eq("id", shopId).maybeSingle(),
    (supabase as any)
      .from("locapass_boost_posts")
      .select("id, title, discount_tag, status, created_at, expires_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const nowMs = Date.now();
  const list = (rows ?? []) as Row[];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">⚡ 緊急ブースト</h1>
        <p className="mt-1 text-sm text-slate-600">
          ドタキャンや作りすぎの時に、1〜3時間限定のお得情報をすぐ掲載できます。
          <Link href="/boost" className="ml-1 underline">お客様側の表示を見る</Link>
          <Link href={`/dashboard/shop/${shopId}/support`} className="ml-2 underline">使い方</Link>
        </p>
      </div>

      <BoostLaunchForm shopId={shopId} defaultImage={shopRow?.cover_url ?? null} />

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">最近のブースト</h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">まだ発射したブーストはありません。</p>
        ) : (
          <ul className="space-y-2">
            {list.map((b) => {
              const live = b.status === "active" && new Date(b.expires_at).getTime() > nowMs;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{b.title}</p>
                    <p className="text-xs text-slate-500">
                      {hhmm(b.created_at)}〜{hhmm(b.expires_at)} {b.discount_tag && `・${b.discount_tag}`}
                    </p>
                  </div>
                  {live ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-black">掲載中</span>
                      <BoostEndButton shopId={shopId} boostId={b.id} />
                    </div>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">終了</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
