import { requireRootAdmin } from "@/lib/admin/require-admin";
import { listThreadsPosts, textModeFromEnv } from "@/lib/social/threadsPosts";
import { createDraftNow, discardDraft, publishDraft } from "./actions";

const MODE_LABEL = { off: "停止中", draft: "下書きだけ作る(確認してから投稿)", auto: "完全自動(確認なしで投稿)" } as const;
const STATUS_LABEL: Record<string, string> = { draft: "下書き", posted: "投稿済み", failed: "失敗", discarded: "破棄" };

export default async function AdminThreadsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const mode = textModeFromEnv();
  const hasToken = Boolean(process.env.THREADS_ACCESS_TOKEN?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const posts = await listThreadsPosts().catch(() => []);
  const drafts = posts.filter((p) => p.status === "draft");
  const others = posts.filter((p) => p.status !== "draft" && p.status !== "discarded");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Threads自動投稿(LOCAPASS公式)</h1>
        <p className="mt-1 text-sm text-slate-600">
          AIが、店舗オーナー向けの集客ノウハウの投稿を書きます。いまは「下書きを作る」までが自動で、内容を確認して「Threadsに投稿」を押すと、公式アカウント(loca.pass)に公開されます。
        </p>
      </div>

      {sp.ok && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{sp.ok}</div>}
      {sp.error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"><p className="font-bold">うまくいきませんでした</p><p className="mt-1">{sp.error}</p></div>}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <p><span className="font-semibold text-slate-700">動作モード:</span> {MODE_LABEL[mode]}<span className="ml-2 text-xs text-slate-500">(Vercelの環境変数 THREADS_TEXT_MODE で変更: off / draft / auto)</span></p>
        <p><span className="font-semibold text-slate-700">Threadsのトークン:</span> {hasToken ? "設定済み" : <span className="font-semibold text-red-700">未設定</span>}</p>
        <p><span className="font-semibold text-slate-700">AI(Gemini)のキー:</span> {hasGemini ? "設定済み" : <span className="font-semibold text-red-700">未設定</span>}</p>
        <form action={createDraftNow} className="pt-2">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">今すぐ下書きを1本作る</button>
          <span className="ml-3 text-xs text-slate-500">AIが書くので、数十秒かかります</span>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">下書き({drafts.length})</h2>
        {drafts.length === 0 && <p className="text-sm text-slate-500">下書きはありません。毎日1本ずつ、自動で増えます(最大3本まで)。</p>}
        {drafts.map((p) => (
          <article key={p.id} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs text-amber-900">テーマ: {p.topic} ・ {new Date(p.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} ・ {p.body.length}文字</p>
            <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-slate-900">{p.body}</p>
            <div className="flex flex-wrap gap-2">
              <form action={publishDraft.bind(null, p.id)}><button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Threadsに投稿(公開されます)</button></form>
              <form action={discardDraft.bind(null, p.id)}><button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">破棄</button></form>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">これまでの投稿</h2>
        {others.length === 0 && <p className="text-sm text-slate-500">まだありません。</p>}
        {others.map((p) => (
          <article key={p.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{STATUS_LABEL[p.status] ?? p.status} ・ {new Date(p.posted_at ?? p.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} ・ テーマ: {p.topic}</p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{p.body}</p>
            {p.error && <p className="text-xs font-semibold text-red-700">{p.error}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
