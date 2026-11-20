import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdBannerInput } from "@/components/admin/AdBannerInput";
import { approveAdCard, createAdCard, deleteAdCard, rejectAdCard, setAdCardActive, updateAdCard } from "./actions";

type Card = {
  id: string;
  title: string;
  label: string;
  headline: string;
  body: string | null;
  cta: string;
  link_url: string;
  image_url: string | null;
  placement: "mid" | "bottom" | "both";
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  shop_id: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  same_category_only: boolean;
  shop: { name: string } | { name: string }[] | null;
};

const PLACEMENT_LABEL: Record<Card["placement"], string> = { mid: "上の枠(横スライド)", bottom: "下の枠(横長バナー)", both: "上の枠と下の枠" };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500";
const labelCls = "block text-sm font-semibold text-slate-700";

/** ISO文字列を、日本時間の yyyy-mm-dd にする(日付入力の初期値)。 */
function jstYmd(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function Fields({ card }: { card?: Card }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>管理用の名前(お客様には出ません)</label>
        <input type="text" name="title" required maxLength={100} defaultValue={card?.title} placeholder="〇〇 秋のキャンペーン" className={input} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label className={labelCls}>ラベル</label>
          <input type="text" name="label" maxLength={20} defaultValue={card?.label ?? "PR"} className={input} />
          <p className="mt-1 text-[11px] text-slate-500">「PR」「お知らせ」など。広告と分かる表示を付けてください。</p>
        </div>
        <div>
          <label className={labelCls}>見出し</label>
          <input type="text" name="headline" required maxLength={80} defaultValue={card?.headline} className={input} />
        </div>
      </div>
      <div>
        <label className={labelCls}>説明(任意)</label>
        <textarea name="body" rows={2} maxLength={200} defaultValue={card?.body ?? ""} className={input} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>ボタンの文言</label>
          <input type="text" name="cta" maxLength={30} defaultValue={card?.cta ?? "詳しく見る"} className={input} />
        </div>
        <div>
          <label className={labelCls}>リンク先</label>
          <input type="text" name="linkUrl" required defaultValue={card?.link_url} placeholder="/pet/app または https://example.com" className={input} />
          <p className="mt-1 text-[11px] text-slate-500">サイト内は / から始まるパス、外部は https:// のURL(別タブで開きます)。</p>
        </div>
      </div>
      <div>
        <label className={labelCls}>画像(任意)</label>
        <AdBannerInput name="image" className="mt-1 block w-full text-sm text-slate-700" />
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
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>表示する場所</label>
          <select name="placement" defaultValue={card?.placement ?? "mid"} className={input}>
            {(Object.keys(PLACEMENT_LABEL) as Card["placement"][]).map((k) => (
              <option key={k} value={k}>
                {PLACEMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>並び順</label>
          <input type="number" name="sortOrder" defaultValue={card?.sort_order ?? 0} className={input} />
          <p className="mt-1 text-[11px] text-slate-500">小さい順に左から。</p>
        </div>
        <div />
        <div>
          <label className={labelCls}>表示の開始日(任意)</label>
          <input type="date" name="startsAt" defaultValue={jstYmd(card?.starts_at ?? null)} className={input} />
        </div>
        <div>
          <label className={labelCls}>表示の終了日(任意)</label>
          <input type="date" name="endsAt" defaultValue={jstYmd(card?.ends_at ?? null)} className={input} />
        </div>
      </div>
    </div>
  );
}

export default async function AdminAdCardsPage() {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("locapass_ad_cards")
    .select("id, title, label, headline, body, cta, link_url, image_url, placement, is_active, sort_order, starts_at, ends_at, shop_id, status, reject_reason, same_category_only, shop:locapass_shops ( name )")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const all = (data ?? []) as Card[];
  const cards = all.filter((c) => !c.shop_id);
  const shopCards = all.filter((c) => c.shop_id);
  const pending = shopCards.filter((c) => c.status === "pending");
  const shopName = (c: Card) => (Array.isArray(c.shop) ? c.shop[0]?.name : c.shop?.name) ?? "(店舗名なし)";

  // 直近30日の表示(imp)とタップ(tap)の回数。記録は service role だけが読める。
  const since = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const { data: events } = await (createAdminClient() as any)
    .from("locapass_ad_events")
    .select("creative, kind")
    .like("creative", "ad:%")
    .gte("day", since)
    .limit(100000);
  const stats = new Map<string, { imp: number; tap: number }>();
  for (const e of (events ?? []) as { creative: string; kind: "imp" | "tap" }[]) {
    const s = stats.get(e.creative) ?? { imp: 0, tap: 0 };
    s[e.kind] += 1;
    stats.set(e.creative, s);
  }

  const now = Date.now();
  const statusOf = (c: Card) => {
    if (!c.is_active) return { text: "停止中", cls: "bg-slate-100 text-slate-500" };
    if (c.starts_at && Date.parse(c.starts_at) > now) return { text: "開始前", cls: "bg-amber-100 text-amber-700" };
    if (c.ends_at && Date.parse(c.ends_at) <= now) return { text: "期間終了", cls: "bg-slate-100 text-slate-500" };
    return { text: "配信中", cls: "bg-emerald-100 text-emerald-700" };
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">店舗ページの広告カード</h1>
        <p className="mt-1 text-sm text-slate-600">
          無料掲載の店舗ページに出す広告・お知らせのカードです。上の枠(基本情報の下)には、配信中のカードが横スライドで並び、
          自動で流れます。下の枠(ページ最下部)には、1枚の横長バナーが出ます。出す・出さないの全体のスイッチは、管理画面トップにあります。
          日本語で書けば、英語・中国語・アラビア語は自動で翻訳します。
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">店舗の広告カード(ADオプション)の承認待ち{pending.length > 0 ? `(${pending.length}件)` : ""}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">承認待ちのカードはありません。</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((c) => (
              <li key={c.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex items-start gap-3">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-slate-500">{shopName(c)}{c.same_category_only ? " · 同じ業種のページだけ" : " · 同じエリアの無料店ページ"}</p>
                    <p className="text-sm font-semibold text-slate-900">{c.headline}</p>
                    {c.body && <p className="text-xs text-slate-700">{c.body}</p>}
                    <p className="truncate text-xs text-slate-500">ボタン「{c.cta}」→ {c.link_url}</p>
                    <div className="flex flex-wrap items-end gap-3 pt-2 text-xs">
                      <form action={approveAdCard.bind(null, c.id)}>
                        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">
                          承認する
                        </button>
                      </form>
                      <form action={rejectAdCard.bind(null, c.id)} className="flex items-center gap-2">
                        <input type="text" name="reason" maxLength={200} placeholder="却下の理由(店舗に表示されます)" className="w-56 rounded border border-slate-300 px-2 py-1.5 text-xs" />
                        <button type="submit" className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50">
                          却下する
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={createAdCard} className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">カードを追加する</h2>
        <Fields />
        <button type="submit" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          追加する
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">登録済みのカード</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">まだカードがありません。</p>
        ) : (
          <ul className="space-y-3">
            {cards.map((c) => {
              const st = statusOf(c);
              const s = stats.get(`ad:${c.id}`) ?? { imp: 0, tap: 0 };
              const rate = s.imp > 0 ? ((s.tap / s.imp) * 100).toFixed(1) : "-";
              return (
                <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    {c.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.text}</span>
                        <span className="text-[11px] text-slate-500">{PLACEMENT_LABEL[c.placement]} · 並び順 {c.sort_order}</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{c.label}</span>
                        {c.headline}
                      </p>
                      <p className="truncate text-xs text-slate-500">{c.link_url}</p>
                      <p className="text-xs text-slate-600">
                        直近30日: 表示 {s.imp.toLocaleString("ja-JP")} 回 / タップ {s.tap.toLocaleString("ja-JP")} 回(タップ率 {rate}
                        {rate === "-" ? "" : "%"})
                      </p>
                      <div className="flex items-center gap-3 pt-1 text-xs">
                        <form action={setAdCardActive.bind(null, c.id, !c.is_active)}>
                          <button type="submit" className="text-blue-600 hover:underline">
                            {c.is_active ? "配信を停止する" : "配信を再開する"}
                          </button>
                        </form>
                        <form action={deleteAdCard.bind(null, c.id)}>
                          <button type="submit" className="text-red-600 hover:underline">
                            削除する
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">内容を編集する</summary>
                    <form action={updateAdCard.bind(null, c.id)} className="mt-3">
                      <Fields card={c} />
                      <button type="submit" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                        保存する
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">店舗の広告カード(承認済み・却下)</h2>
        {shopCards.filter((c) => c.status !== "pending").length === 0 ? (
          <p className="text-sm text-slate-500">まだありません。</p>
        ) : (
          <ul className="space-y-3">
            {shopCards
              .filter((c) => c.status !== "pending")
              .map((c) => {
                const s = stats.get(`ad:${c.id}`) ?? { imp: 0, tap: 0 };
                return (
                  <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{shopName(c)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "approved" ? (c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500") : "bg-red-100 text-red-700"}`}>
                        {c.status === "approved" ? (c.is_active ? "配信中" : "店舗が停止中") : "却下"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{c.headline}</p>
                    {c.reject_reason && <p className="text-xs text-red-600">却下の理由: {c.reject_reason}</p>}
                    <p className="mt-1 text-xs text-slate-600">
                      直近30日: 表示 {s.imp.toLocaleString("ja-JP")} 回 / タップ {s.tap.toLocaleString("ja-JP")} 回
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {c.status === "approved" && (
                        <form action={rejectAdCard.bind(null, c.id)}>
                          <input type="hidden" name="reason" value="運営により配信を停止しました" />
                          <button type="submit" className="text-red-600 hover:underline">
                            配信をやめさせる(却下に戻す)
                          </button>
                        </form>
                      )}
                      {c.status === "rejected" && (
                        <form action={approveAdCard.bind(null, c.id)}>
                          <button type="submit" className="text-blue-600 hover:underline">
                            承認する
                          </button>
                        </form>
                      )}
                      <form action={deleteAdCard.bind(null, c.id)}>
                        <button type="submit" className="text-red-600 hover:underline">
                          削除する
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
