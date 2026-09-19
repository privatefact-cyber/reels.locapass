import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { sendShopMessage } from "../not-connected";

/**
 * LUXELA本家のお客様へのメッセージ画面(app/dashboard/messages/page.tsx)と同じ画面。
 * お気に入り登録者の一覧・送信はlocapass側に受け皿が無いため未接続(空表示・送信は「未接続」)。
 */
export default async function LocapassShopMessagesPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  // お気に入り登録者: locapass_shop_favoritesは本人の行しか読めないRLSで、本家のような
  // 集計の受け皿もlocapass側に無いため未接続(空)。
  const favoriteUsers: { userId: string; nickname: string }[] = [];

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">お気に入りユーザーへのメッセージ</h1>
        <p className="mt-1 text-sm text-slate-600">
          {shop.name}をお気に入り登録中のユーザー({favoriteUsers.length}人)にプッシュ通知とお知らせを送れます。
        </p>
      </div>

      <form action={sendShopMessage} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700">送信先</label>
          <select
            name="target_user_id"
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">お気に入り登録者 全員({favoriteUsers.length}人)</option>
            {favoriteUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.nickname}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">本文</label>
          <textarea
            name="body"
            required
            rows={4}
            maxLength={500}
            placeholder="今週末はイベント開催中です！ぜひ遊びに来てください。"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          送信する
        </button>
      </form>
    </div>
  );
}
