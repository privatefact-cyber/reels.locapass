import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getLocapassShopForDashboard } from "@/lib/locapass-dashboard/current-shop";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendShopMessage } from "../not-connected";

/**
 * LUXELA本家のお客様へのメッセージ画面(app/dashboard/messages/page.tsx)と同じ画面。
 * 送信先のお気に入り登録者はlocapass_shop_favorites/locapass_membersから読む。
 * 送信(通知の保存先)はlocapassに受け皿が無いため「未接続」を返す。
 */
export default async function LocapassShopMessagesPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const scope = await requireAdmin();
  const shop = await getLocapassShopForDashboard(shopId, scope);
  if (!shop) notFound();

  // お気に入り登録者はlocapass_shop_favorites(本人以外読めないRLS)なので、本家と同じくservice roleで読む。
  const supabase = createAdminClient();
  const { data: favorites } = await supabase
    .from("locapass_shop_favorites")
    .select("member_id, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const memberIds = (favorites ?? []).map((f) => f.member_id);
  const { data: members } = memberIds.length
    ? await supabase.from("locapass_members").select("id, nickname").in("id", memberIds)
    : { data: [] as { id: string; nickname: string | null }[] };
  const nicknameById = new Map((members ?? []).map((m) => [m.id, m.nickname]));

  const favoriteUsers = (favorites ?? []).map((f) => ({
    userId: f.member_id,
    nickname: nicknameById.get(f.member_id) ?? "ゲスト",
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
