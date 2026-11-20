import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResizingImageInput } from "@/components/admin/ResizingImageInput";
import { createShopAdCard, deleteShopAdCard, setShopAdCardActive, updateShopAdCard } from "./actions";

type Card = {
  id: string;
  headline: string;
  body: string | null;
  cta: string;
  link_url: string;
  image_url: string | null;
  is_active: boolean;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  same_category_only: boolean;
};

const MAX_CARDS = 3;
const EXCLUDED_PLANS = ["free", "lite"];
const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500";
const labelCls = "block text-sm font-semibold text-slate-700";

const STATUS: Record<Card["status"], { text: string; cls: string }> = {
  pending: { text: "承認待ち", cls: "bg-amber-100 text-amber-700" },
  approved: { text: "承認済み", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { text: "承認されませんでした", cls: "bg-red-100 text-red-700" },
};

function Fields({ card }: { card?: Card }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>見出し</label>
        <input type="text" name="headline" required maxLength={80} defaultValue={card?.headline} placeholder="例: 初回のお客様は〇〇が無料" className={input} />
      </div>
      <div>
        <label className={labelCls}>説明(任意)</label>
        <textarea name="body" rows={2} maxLength={200} defaultValue={card?.body ?? ""} className={input} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>ボタンの文言</label>
          <input type="text" name="cta" maxLength={30} defaultValue={card?.cta ?? "お店の詳細を見る"} placeholder="例: 予約はこちら / LINEでクーポンを受け取る" className={input} />
        </div>
        <div>
          <label className={labelCls}>リンク先のURL(任意)</label>
          <input type="text" name="linkUrl" defaultValue={card && card.link_url.startsWith("https://") ? card.link_url : ""} placeholder="空欄なら、お店の詳細ページ" className={input} />
          <p className="mt-1 text-[11px] text-slate-500">予約ページ・公式LINE・Instagram・キャンペーンやクーポンのページなど、https:// のURLを自由に入れられます。入れなければ、お店の詳細ページに飛びます。</p>
        </div>
      </div>
      <div>
        <label className={labelCls}>画像(任意)</label>
        <ResizingImageInput name="image" className="mt-1 block w-full text-sm text-slate-700" />
        {card?.image_url && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" name="removeImage" /> 画像を外す
            </label>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="sameCategory" defaultChecked={card?.same_category_only ?? false} />
        同じ業種のお店のページにだけ出す
      </label>
    </div>
  );
}

/** 店舗管理画面の「広告」。ADオプションの店舗が、自分のカードを登録・管理する。 */
export default async function DashboardAdsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const view = await getShopForManager(shopId);
  if (!view) notFound();
  const shop = view.shop;
  const admin = createAdminClient() as any;
  const { data: opt } = await admin.from("locapass_shops").select("ad_option_enabled, plan").eq("id", shop.id).maybeSingle();
  const enabled = Boolean(opt?.ad_option_enabled);
  const planOk = !!opt?.plan && !EXCLUDED_PLANS.includes(opt.plan);

  if (!enabled || !planOk) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <section>
          <p className="text-xs text-slate-500">{shop.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">広告カード</h1>
        </section>
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p>
            広告カード(ADオプション)は、お店の広告を、同じエリアの無料掲載の店舗ページに出せる機能です。
            カードは最大{MAX_CARDS}枚まで登録でき、表示回数とタップ数をこの画面で確認できます。
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {!planOk ? "通常版以上のプランで、オプションをオンにすると使えます。" : "オプションをオンにすると使えます。"}
            ご利用のご相談は、「使い方」のサポートからお問い合わせください。
          </p>
        </div>
      </div>
    );
  }

  const { data } = await admin
    .from("locapass_ad_cards")
    .select("id, headline, body, cta, link_url, image_url, is_active, status, reject_reason, same_category_only")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: true });
  const cards = (data ?? []) as Card[];

  const since = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const stats = new Map<string, { imp: number; tap: number }>();
  {
    const { data: events } = await admin
      .from("locapass_ad_events")
      .select("creative, kind")
      .in("creative", [...cards.map((c) => `ad:${c.id}`), `auto:${shop.id}`])
      .gte("day", since)
      .limit(100000);
    for (const e of (events ?? []) as { creative: string; kind: "imp" | "tap" }[]) {
      const s = stats.get(e.creative) ?? { imp: 0, tap: 0 };
      s[e.kind] += 1;
      stats.set(e.creative, s);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">広告カード</h1>
        <p className="mt-1 text-sm text-slate-600">
          お店の広告を、同じエリアの無料掲載の店舗ページに出せます(カードは最大{MAX_CARDS}枚)。登録したカードは、運営が確認してから配信されます。
          内容を直したときも、もう一度確認が入ります。
        </p>
      </section>

      {!cards.some((c) => c.status === "approved" && c.is_active) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-emerald-800">いまは「自動カード」で配信中です</p>
          <p className="mt-1 text-xs">
            カードを登録しなくても、お店の名前・ひとこと・写真から作ったカードが、同じエリアの無料店ページに出ています(ボタンは「お店の詳細を見る」で、お店の詳細ページに飛びます)。
            下でカードを登録すると、運営が承認した後は、そのカードに置き換わります(承認待ちの間も、自動カードで配信されます)。
          </p>
          {(() => {
            const a = stats.get(`auto:${shop.id}`) ?? { imp: 0, tap: 0 };
            return (
              <p className="mt-2 text-xs text-slate-600">
                直近30日: 表示 {a.imp.toLocaleString("ja-JP")} 回 / タップ {a.tap.toLocaleString("ja-JP")} 回
              </p>
            );
          })()}
        </div>
      )}

      {cards.length < MAX_CARDS && (
        <form action={createShopAdCard.bind(null, shop.id)} className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">カードを追加する</h2>
          <Fields />
          <button type="submit" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            登録して承認を依頼する
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">登録済みのカード</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">まだカードがありません。</p>
        ) : (
          <ul className="space-y-3">
            {cards.map((c) => {
              const st = STATUS[c.status];
              const s = stats.get(`ad:${c.id}`) ?? { imp: 0, tap: 0 };
              const rate = s.imp > 0 ? `${((s.tap / s.imp) * 100).toFixed(1)}%` : "-";
              return (
                <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    {c.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.text}</span>
                        {c.status === "approved" && !c.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">停止中</span>}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{c.headline}</p>
                      {c.status === "rejected" && c.reject_reason && <p className="text-xs text-red-600">理由: {c.reject_reason}</p>}
                      <p className="text-xs text-slate-600">
                        直近30日: 表示 {s.imp.toLocaleString("ja-JP")} 回 / タップ {s.tap.toLocaleString("ja-JP")} 回(タップ率 {rate})
                      </p>
                      <div className="flex items-center gap-3 pt-1 text-xs">
                        {c.status === "approved" && (
                          <form action={setShopAdCardActive.bind(null, shop.id, c.id, !c.is_active)}>
                            <button type="submit" className="text-blue-600 hover:underline">
                              {c.is_active ? "配信を止める" : "配信を再開する"}
                            </button>
                          </form>
                        )}
                        <form action={deleteShopAdCard.bind(null, shop.id, c.id)}>
                          <button type="submit" className="text-red-600 hover:underline">
                            削除する
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">内容を直す(もう一度確認が入ります)</summary>
                    <form action={updateShopAdCard.bind(null, shop.id, c.id)} className="mt-3">
                      <Fields card={c} />
                      <button type="submit" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                        保存して承認を依頼する
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
