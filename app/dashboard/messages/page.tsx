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
    .select("user_id, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  // user_shop_favorites.user_idにFKが無く埋め込みselectができないため、
  // プロフィール(locapass_members、実際の会員データが入っているテーブル)は別クエリで引く。
  const userIds = Array.from(new Set((favorites ?? []).map((f) => f.user_id)));
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("locapass_members").select("id, nickname").in("id", userIds)
      : { data: [] as { id: string; nickname: string | null }[] };
  const nicknameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

  const favoriteUsers = (favorites ?? []).map((f) => ({
    userId: f.user_id,
    nickname: nicknameById.get(f.user_id) ?? "ゲスト",
  }));

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
