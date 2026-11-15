import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { KnowledgeDropzone } from "@/components/locapass-dashboard/KnowledgeDropzone";
import { ResizingImageInput } from "@/components/admin/ResizingImageInput";
import { MAX_TOTAL_ACTIVE_CHARS } from "@/lib/shop/extractKnowledge";
import { addKnowledgeNote, answerUnanswered, deleteKnowledge, dismissUnanswered, saveAiAvatar, saveKnowledgeItem, setKnowledgeActive } from "./actions";

type Item = { id: string; kind: "file" | "note" | "answer"; title: string; source_name: string | null; extracted_text: string; status: "pending" | "active" | "inactive"; valid_until: string | null; updated_at: string };
type Unanswered = { id: string; question: string; created_at: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const KIND_LABEL = { file: "ファイル", note: "メモ", answer: "一言回答" } as const;

/** 店舗AI質問の「AIの知識」。ファイルを置くだけでAIが読み取り、確認してOKを押すとAIの回答に使われる。 */
export default async function DashboardAiKnowledgePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const view = await getShopForManager(shopId);
  if (!view) notFound();
  const shop = view.shop;

  const supabase = (await createClient()) as any;
  const [{ data: opt }, { data: itemRows }, { data: unansweredRows }, { data: castRows }] = await Promise.all([
    supabase.from("locapass_shops").select("ai_chat_enabled, ai_avatar_kind, ai_avatar_staff_id, ai_avatar_image_url, ai_avatar_consent").eq("id", shop.id).maybeSingle(),
    supabase.from("locapass_shop_ai_knowledge").select("id, kind, title, source_name, extracted_text, status, valid_until, updated_at").eq("shop_id", shop.id).order("updated_at", { ascending: false }).limit(100),
    supabase.from("locapass_shop_ai_chats").select("id, question, created_at").eq("shop_id", shop.id).eq("answerable", false).eq("handled", false).order("created_at", { ascending: false }).limit(30),
    supabase.from("locapass_shop_staff_members").select("id, name").eq("shop_id", shop.id).is("deleted_at", null).order("name").limit(200),
  ]);
  const staffList = (castRows ?? []) as { id: string; name: string | null }[];
  const avatarKind = opt?.ai_avatar_consent ? ((opt?.ai_avatar_kind as string | null) ?? "none") : "none";
  const avatarStaffId = avatarKind === "staff" ? ((opt?.ai_avatar_staff_id as string | null) ?? "") : "";
  const avatarImage = (opt?.ai_avatar_image_url as string | null) ?? null;
  const enabled = Boolean(opt?.ai_chat_enabled);
  const items = (itemRows ?? []) as Item[];
  const unanswered = (unansweredRows ?? []) as Unanswered[];
  const today = todayJst();
  const pending = items.filter((i) => i.status === "pending");
  const others = items.filter((i) => i.status !== "pending");
  const activeChars = items.filter((i) => i.status === "active" && (!i.valid_until || i.valid_until >= today)).reduce((n, i) => n + i.extracted_text.length, 0);

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">AIの知識</h1>
        <p className="mt-1 text-sm text-slate-600">
          お客様が店舗AIに質問したとき、AIはまず店舗情報(営業時間・料金・出勤など)を見て、足りないことをここの資料から探して答えます。
          資料を置くだけで、AIが読み取ります。内容を確認して「OK」を押すと、使われ始めます。
        </p>
        {!enabled && <p className="mt-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">店舗AI質問は、現在ご利用になっていません(オプション未契約)。資料は準備しておけますが、お客様への回答には使われません。</p>}
        <p className="mt-2 text-xs text-slate-500">
          AIが読んでいる量: {activeChars.toLocaleString()} / {MAX_TOTAL_ACTIVE_CHARS.toLocaleString()} 文字 ・ 質問と答えは <Link href={`/dashboard/shop/${shopId}/ai-questions`} className="underline">「AIへの質問」</Link> で見られます
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">AIコンシェルジュの顔</h2>
        <p className="text-sm text-slate-600">
          初期設定は、AIのアイコンです。お好きな写真に変えたいときは、下から写真を選んでください。会話画面には、常に「AI」と表示されます。
        </p>
        <form action={saveAiAvatar.bind(null, shopId)} className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="kind" value="none" defaultChecked={avatarKind !== "custom"} /> AIのアイコン(初期設定)
          </label>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="kind" value="custom" defaultChecked={avatarKind === "custom"} /> 任意の写真
            </label>
            <ResizingImageInput name="image" className="block text-sm" />
            {avatarKind === "custom" && avatarImage && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarImage} alt="" className="h-12 w-12 rounded-full border border-slate-200 object-cover" />
                <span className="text-xs text-emerald-700">いま設定中(選び直さなければ、このまま使います)</span>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="consent" value="1" defaultChecked={avatarKind === "custom"} className="mt-1 h-4 w-4" />
            <span>写真に写る人・著作物について、<b>使ってよいことを確認しました</b>(写真を選ぶときは必須)</span>
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">保存する</button>
        </form>
      </section>

      <KnowledgeDropzone shopId={shopId} />

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">確認待ち({pending.length})</h2>
          <p className="text-sm text-slate-600">AIはこう読み取りました。<b>料金・時間・日付が合っているか</b>を見て、直すところがあれば直してから「OK」を押してください。押すまでは、お客様への回答には使われません。</p>
          {pending.map((i) => (
            <form key={i.id} action={saveKnowledgeItem.bind(null, shopId, i.id)} className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <input type="hidden" name="confirm" value="1" />
              <p className="text-[11px] text-slate-500">元のファイル: {i.source_name ?? "-"}</p>
              <div>
                <label className="text-xs font-semibold text-slate-700">題名</label>
                <input name="title" defaultValue={i.title} maxLength={40} required className={input} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">AIが読み取った内容(直せます)</label>
                <textarea name="text" defaultValue={i.extracted_text} rows={10} required className={`${input} font-mono`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">いつまで使うか(任意。イベントなど。この日を過ぎると自動で使われなくなります)</label>
                <input type="date" name="valid_until" defaultValue={i.valid_until ?? ""} className={input} />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">これでOK(AIに使わせる)</button>
                <button type="submit" formAction={deleteKnowledge.bind(null, shopId, i.id)} formNoValidate className="text-sm text-red-600 hover:underline">捨てる</button>
              </div>
            </form>
          ))}
        </section>
      )}

      {unanswered.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">お客様に聞かれて、答えられなかった質問({unanswered.length})</h2>
          <p className="text-sm text-slate-600">一言で答えを書くと、次から、AIがその答えを使います。答えなくてよい質問は「外す」を押してください。</p>
          {unanswered.map((u) => (
            <div key={u.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] text-slate-400">{fmt(u.created_at)}</p>
              <p className="text-sm font-semibold text-slate-900">Q. {u.question}</p>
              <form action={answerUnanswered.bind(null, shopId, u.id)} className="flex flex-wrap items-center gap-2">
                <input name="answer" required maxLength={800} placeholder="答え(例: ドレスコードはありません。普段着でどうぞ)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">保存</button>
                <button type="submit" formAction={dismissUnanswered.bind(null, shopId, u.id)} formNoValidate className="text-sm text-slate-500 hover:underline">外す</button>
              </form>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">登録済みの資料({others.length})</h2>
        {others.length === 0 ? (
          <p className="text-sm text-slate-500">まだありません。上のドロップ欄にファイルを置いてみてください。</p>
        ) : (
          others.map((i) => {
            const expired = !!i.valid_until && i.valid_until < today;
            return (
              <details key={i.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{i.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{KIND_LABEL[i.kind]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${expired ? "bg-slate-200 text-slate-500" : i.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {expired ? "期限切れ(使われません)" : i.status === "active" ? "使っています" : "停止中"}
                  </span>
                  {i.valid_until && !expired && <span className="text-[11px] text-slate-500">{i.valid_until}まで</span>}
                  <span className="ml-auto text-[11px] text-slate-400">{fmt(i.updated_at)}</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <form action={saveKnowledgeItem.bind(null, shopId, i.id)} className="space-y-3">
                    <input name="title" defaultValue={i.title} maxLength={40} required className={input} />
                    <textarea name="text" defaultValue={i.extracted_text} rows={8} required className={`${input} font-mono`} />
                    <div>
                      <label className="text-xs font-semibold text-slate-700">いつまで使うか(任意)</label>
                      <input type="date" name="valid_until" defaultValue={i.valid_until ?? ""} className={input} />
                    </div>
                    <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">変更を保存</button>
                  </form>
                  <div className="flex items-center gap-4">
                    <form action={setKnowledgeActive.bind(null, shopId, i.id, i.status !== "active")}>
                      <button type="submit" className="text-sm text-blue-600 hover:underline">{i.status === "active" ? "使うのをやめる(停止)" : "使う(有効にする)"}</button>
                    </form>
                    <form action={deleteKnowledge.bind(null, shopId, i.id)}>
                      <button type="submit" className="text-sm text-red-600 hover:underline">削除する</button>
                    </form>
                  </div>
                </div>
              </details>
            );
          })
        )}
      </section>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">ファイルがないときは、文章を直接書いて足せます</summary>
        <form action={addKnowledgeNote.bind(null, shopId)} className="mt-3 space-y-3">
          <input name="title" required maxLength={40} placeholder="題名(例: VIPルームのご案内)" className={input} />
          <textarea name="text" required rows={6} placeholder="AIに知っておいてほしい内容" className={input} />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">追加する</button>
        </form>
      </details>
    </div>
  );
}
