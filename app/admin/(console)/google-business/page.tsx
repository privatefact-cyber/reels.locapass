import { createClient } from "@/lib/supabase/server";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { gbpConfigured } from "@/lib/gbp/client";
import { addGbpLink, removeGbpLink, syncGbpNow, updateGbpLink } from "./actions";

type Link = {
  shop_id: string;
  gbp_location_id: string;
  enabled: boolean;
  sync_hours: boolean;
  sync_phone: boolean;
  sync_description: boolean;
  last_synced_at: string | null;
  last_status: "ok" | "dry_run" | "error" | null;
  last_error: string | null;
  last_payload: unknown;
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ok: { text: "Googleへ送信済み", cls: "bg-emerald-100 text-emerald-800" },
  dry_run: { text: "確認のみ(未接続)", cls: "bg-amber-100 text-amber-800" },
  error: { text: "失敗", cls: "bg-red-100 text-red-800" },
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

export default async function GoogleBusinessPage() {
  await requireRootAdmin();
  const supabase = (await createClient()) as any;

  const [{ data: linkRows }, { data: shopRows }] = await Promise.all([
    supabase.from("locapass_gbp_links").select("*").order("created_at", { ascending: false }),
    supabase.from("locapass_shops").select("id, name").order("name").limit(2000),
  ]);
  const links = (linkRows ?? []) as Link[];
  const shops = (shopRows ?? []) as { id: string; name: string }[];
  const nameById = new Map(shops.map((s) => [s.id, s.name]));
  const linked = new Set(links.map((l) => l.shop_id));
  const connected = gbpConfigured();

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Googleビジネスプロフィール連携</h1>
        <p className="mt-1 text-sm text-slate-600">
          連携を依頼された店舗(代行)の営業時間・電話番号・臨時休業を、locapassの登録内容どおりにGoogleマップへ送ります。
          店舗の情報を直せば、毎日自動でGoogle側にも反映されます(ここの「今すぐ送る」で即時にも送れます)。
        </p>
        <p className={`mt-3 inline-block rounded-lg px-3 py-2 text-sm ${connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {connected
            ? "Googleに接続済みです。「今すぐ送る」「毎日の自動送信」は実際にGoogleへ反映されます。"
            : "Googleとはまだ接続していません。いまは「送る内容の確認」だけができ、Googleへは何も送られません(利用申請の承認後に接続します)。"}
        </p>
      </div>

      <form action={addGbpLink} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">店舗を連携に追加</h2>
        <p className="text-xs text-slate-500">
          事前に、店舗のGoogleビジネスプロフィールで運営のGoogleアカウントを「管理者」として招待してもらってください。
          ロケーションIDは、運営アカウントで管理画面(Business Profile)を開いて確認できる数字です。
        </p>
        <div className="flex flex-wrap gap-3">
          <select name="shopId" required defaultValue="" className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
            <option value="" disabled>
              店舗を選ぶ
            </option>
            {shops
              .filter((s) => !linked.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <input
            name="locationId"
            required
            inputMode="numeric"
            placeholder="ロケーションID(数字)"
            className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500"
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            追加
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">連携中の店舗({links.length})</h2>
        {links.length === 0 && <p className="text-sm text-slate-500">まだ連携している店舗はありません。</p>}
        {links.map((l) => {
          const st = l.last_status ? STATUS_LABEL[l.last_status] : null;
          return (
            <div key={l.shop_id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{nameById.get(l.shop_id) ?? l.shop_id}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {st && <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.text}</span>}
                  <span>最終: {fmt(l.last_synced_at)}</span>
                </div>
              </div>
              {l.last_error && <p className="text-xs text-red-700">{l.last_error}</p>}

              <form action={updateGbpLink} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                <input type="hidden" name="shopId" value={l.shop_id} />
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="enabled" defaultChecked={l.enabled} /> 同期する
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="sync_hours" defaultChecked={l.sync_hours} /> 営業時間・臨時休業
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="sync_phone" defaultChecked={l.sync_phone} /> 電話番号
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="sync_description" defaultChecked={l.sync_description} /> 説明文(Google側の文章を上書き)
                </label>
                <input
                  name="locationId"
                  defaultValue={l.gbp_location_id.replace("locations/", "")}
                  inputMode="numeric"
                  className="w-56 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                  aria-label="ロケーションID"
                />
                <button type="submit" className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:border-slate-500">
                  保存
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                <form action={syncGbpNow}>
                  <input type="hidden" name="shopId" value={l.shop_id} />
                  <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    {connected ? "今すぐ送る" : "送る内容を確認"}
                  </button>
                </form>
                <form action={removeGbpLink}>
                  <input type="hidden" name="shopId" value={l.shop_id} />
                  <button type="submit" className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                    連携を解除
                  </button>
                </form>
              </div>

              {l.last_payload != null && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer">直近に送った(送る予定の)内容</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-50 p-3">{JSON.stringify(l.last_payload, null, 2)}</pre>
                </details>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
