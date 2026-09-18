import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendShopMessage } from "./actions";

export default async function DashboardMessagesPage() {
  const shop = await requireCurrentShop();
  if (!shop) {
    return <p className="text-sm text-red-600">所属店舗が見つかりません。運営者にお問い合わせください。</p>;
  }

  const supabase = createAdminClient();
  const { data: favorites } = await supabase
    .from("user_shop_favorites")
    .select("user_id, created_at, user_profiles ( nickname )")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const favoriteUsers = (favorites ?? []).map((f) => {
    const profile = Array.isArray(f.user_profiles) ? f.user_profiles[0] : f.user_profiles;
    return { userId: f.user_id, nickname: profile?.nickname ?? "ゲスト" };
  });

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
