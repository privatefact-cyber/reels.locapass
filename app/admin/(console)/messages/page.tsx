import { sendAdminBroadcast } from "./actions";

export default function AdminMessagesPage() {
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">全ユーザーへのお知らせ</h1>
        <p className="mt-1 text-sm text-slate-600">
          LOCAPASSの全ユーザーにプッシュ通知とお知らせを一斉配信します。取り消せないので内容をよく確認してから送信してください。
        </p>
      </div>

      <form action={sendAdminBroadcast} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700">タイトル</label>
          <input
            type="text"
            name="title"
            required
            maxLength={100}
            placeholder="メンテナンスのお知らせ"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">本文</label>
          <textarea
            name="body"
            rows={4}
            maxLength={500}
            placeholder="9/15 2:00〜4:00にメンテナンスを実施します。"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">リンク先(任意)</label>
          <input
            type="text"
            name="url"
            placeholder="/events"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          全ユーザーに送信する
        </button>
      </form>
    </div>
  );
}
