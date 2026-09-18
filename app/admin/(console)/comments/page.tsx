import { createClient } from "@/lib/supabase/server";
import { banUser, deleteCommentAsAdmin, unbanUser } from "./actions";

export default async function AdminCommentsPage() {
  const supabase = await createClient();

  const [{ data: comments }, { data: banned }] = await Promise.all([
    supabase
      .from("reel_comments")
      .select(
        // shopsとreelsの間には外部キーが2本(reels.shop_id / shops.map_preview_reel_id)あるので、使うキーを明示する。
        "id, body, author_type, user_id, created_at, reels ( id, caption, cast_members ( name ), shops!reels_shop_id_fkey ( name ) )",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("banned_users").select("user_id, reason, created_at").order("created_at", { ascending: false }),
  ]);

  const bannedIds = new Set((banned ?? []).map((b) => b.user_id));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">コメント管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          サイト全体のリールコメントを確認・削除できます。悪質なユーザーはBANすると以後投稿できなくなります。
        </p>
      </section>

      {banned && banned.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">BAN中のユーザー</h2>
          <ul className="divide-y divide-black/10">
            {banned.map((b) => (
              <li key={b.user_id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs text-slate-500">
                  {b.user_id}
                  {b.reason && <span className="ml-2 text-slate-400">({b.reason})</span>}
                </span>
                <form action={unbanUser.bind(null, b.user_id)}>
                  <button type="submit" className="text-xs text-blue-600 hover:underline">
                    BAN解除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">最近のコメント(最新200件)</h2>
        {comments && comments.length > 0 ? (
          <ul className="divide-y divide-black/10">
            {comments.map((c) => {
              const reel = Array.isArray(c.reels) ? c.reels[0] : c.reels;
              const cast = reel ? (Array.isArray(reel.cast_members) ? reel.cast_members[0] : reel.cast_members) : null;
              const shop = reel ? (Array.isArray(reel.shops) ? reel.shops[0] : reel.shops) : null;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-slate-900">
                      {c.author_type === "cast" ? "[キャスト返信] " : ""}
                      {c.body}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {shop?.name ?? "-"} / {cast?.name ?? "-"} ・{" "}
                      {new Date(c.created_at).toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <form action={deleteCommentAsAdmin.bind(null, c.id)}>
                      <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                        削除
                      </button>
                    </form>
                    {c.author_type === "customer" && c.user_id && !bannedIds.has(c.user_id) && (
                      <form action={banUser.bind(null, c.user_id, "コメント管理画面からBAN")}>
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          BAN
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">コメントはまだありません。</p>
        )}
      </section>
    </div>
  );
}
