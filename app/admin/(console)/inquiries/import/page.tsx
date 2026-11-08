import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { STATUS_LABEL, STATUSES } from "@/lib/lpInquiry/shared";
import { importCsv, importMail } from "./actions";

export const dynamic = "force-dynamic";

const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900";

function Defaults() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">
        種別(データに種別が無いときに使います)
        <select name="default_type" defaultValue="shop" className={field}>
          <option value="shop">掲載店</option>
          <option value="agency">販売代理店</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">
        状態(データに状態が無いときに使います)
        <select name="default_status" defaultValue="closed" className={field}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

const SAMPLE_MAIL = `店舗名:カフェ サンプル
業種:カフェ・スイーツ
所在地:東京都渋谷区
担当者名:山田 太郎
連絡先:sample@example.com
URL:https://example.com
ご相談内容:掲載について教えてください。
====
店舗名:サンプル食堂
担当者名:鈴木
連絡先:03-1234-5678
ご相談内容:料金を知りたいです。`;

/** 過去のお問い合わせ(メールで届いていた分など)を、履歴に取り込む。 */
export default async function AdminInquiryImportPage({ searchParams }: { searchParams: Promise<{ tone?: string; notice?: string; errors?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;

  return (
    <div className="max-w-3xl space-y-6 text-slate-900">
      <Link href="/admin/inquiries" className="text-sm font-semibold text-blue-700 hover:underline">← お問い合わせ一覧</Link>
      <div>
        <h1 className="text-3xl font-bold">過去のお問い合わせを取り込む</h1>
        <p className="mt-1 text-sm text-slate-600">
          これまでメールなどで届いていた問い合わせを、履歴に入れます。同じ内容(種別・店舗名・連絡先・ご相談内容が同じもの)は、二重には取り込まれません。
        </p>
      </div>

      {sp.notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${sp.tone === "ng" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <p className="font-semibold">{sp.notice}</p>
          {sp.errors && <p className="mt-1 text-xs leading-5">{sp.errors}</p>}
        </div>
      )}

      <form action={importCsv} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">1. CSV・表計算から取り込む</h2>
        <p className="text-xs leading-5 text-slate-600">
          1行目を見出しにして、貼り付けるか、CSVファイルを選びます。必要な列だけで構いません(店舗名または会社名と、連絡先は必須)。
          <br />
          使える見出し: 受付日時 / 種別 / 状態 / 店舗名・会社名 / ご担当者名 / 連絡先 / メールアドレス / 電話番号 / 所在地 / 業種 / 事業内容 / URL / ご相談内容
          <br />
          「CSVで書き出す」で出力したファイルも、そのまま取り込めます。
        </p>
        <Defaults />
        <label className="block text-xs font-semibold text-slate-600">
          貼り付け
          <textarea name="csv" rows={8} placeholder={"受付日時,種別,店舗名・会社名,ご担当者名,連絡先,ご相談内容\n2026/10/20 10:30,掲載店,カフェ サンプル,山田,sample@example.com,掲載について教えてください"} className={field + " font-mono"} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          またはCSVファイル
          <input type="file" name="file" accept=".csv,text/csv,.tsv,text/plain" className="mt-1 block text-sm font-normal" />
        </label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">CSVを取り込む</button>
      </form>

      <form action={importMail} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">2. 届いたメールの本文から取り込む</h2>
        <p className="text-xs leading-5 text-slate-600">
          フォームから届いたメールの本文(「店舗名:〇〇」「連絡先:〇〇」のような行)を、そのまま貼り付けます。複数のメールは、「====」だけの行で区切ります。
          受付日時はメールには入っていないので、取り込んだ日時になります(日時を残したいときは、CSVで取り込んでください)。
        </p>
        <Defaults />
        <label className="block text-xs font-semibold text-slate-600">
          メール本文
          <textarea name="mail" rows={10} placeholder={SAMPLE_MAIL} className={field + " font-mono"} />
        </label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">メールの内容を取り込む</button>
      </form>
    </div>
  );
}
