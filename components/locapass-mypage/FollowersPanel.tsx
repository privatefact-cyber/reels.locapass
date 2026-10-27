"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Follower = { userId: string; nickname: string; avatarUrl: string | null; iFollowBack: boolean };
type Blocked = { userId: string; nickname: string };

/**
 * スタッフ/FACES本人向けのフォロワー一覧。フォローバックして相互フォローになると、その相手とのDMが開く。
 * ブロックすると双方向のフォローが外れてDMも閉じる(ブロック済みの相手は下の一覧から解除できる)。
 */
export function FollowersPanel({ flush = false }: { flush?: boolean }) {
  const router = useRouter();
  const [followers, setFollowers] = useState<Follower[] | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: f }, { data: b }] = await Promise.all([
      supabase.rpc("locapass_my_followers"),
      supabase.rpc("locapass_my_blocked_users"),
    ]);
    setFollowers(
      (f ?? []).map((r) => ({ userId: r.user_id, nickname: r.nickname, avatarUrl: r.avatar_url, iFollowBack: r.i_follow_back })),
    );
    setBlocked((b ?? []).map((r) => ({ userId: r.user_id, nickname: r.nickname })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(userId: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusyId(userId);
    setError(null);
    const { error: rpcError } = await action();
    if (rpcError) setError("操作に失敗しました");
    await load();
    setBusyId(null);
  }

  const supabase = createClient();

  // 相互フォローの相手に、ここからそのままメッセージを始められる。
  async function startMessage(userId: string) {
    setBusyId(userId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("locapass_get_or_create_dm_thread_with_user", { p_user_id: userId });
    if (rpcError || !data) {
      setError("メッセージを開けませんでした");
      setBusyId(null);
      return;
    }
    router.push(`/mypage/messages/${data}`);
  }

  return (
    <section className={`${flush ? "" : "mx-4 mt-6 "}rounded-2xl border border-main/10 bg-surface p-4`}>
      <h2 className="text-sm font-bold text-tone-100">フォロワー</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-tone-500">
        フォローバックして相互フォローになると、お互いにメッセージを送れるようになります。どちらかがフォローを外すと送れなくなります。
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {followers === null ? (
        <p className="mt-3 text-xs text-tone-500">読み込み中...</p>
      ) : followers.length === 0 ? (
        <p className="mt-3 text-xs text-tone-500">まだフォロワーはいません。</p>
      ) : (
        <ul className="mt-3 divide-y divide-main/10">
          {followers.map((f) => (
            <li key={f.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              {f.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-800 text-sm text-tone-500">
                  {f.nickname.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1 basis-24">
                <p className="truncate text-sm text-tone-100">{f.nickname}</p>
                {f.iFollowBack && <p className="text-[10px] text-hl-400">相互フォロー(メッセージ可)</p>}
              </div>
              {f.iFollowBack && (
                <button
                  type="button"
                  disabled={busyId === f.userId}
                  onClick={() => startMessage(f.userId)}
                  className="shrink-0 rounded-full bg-gradient-to-r from-cta-light to-cta px-3 py-1.5 text-xs font-semibold text-on-cta disabled:opacity-50"
                >
                  メッセージ
                </button>
              )}
              <button
                type="button"
                disabled={busyId === f.userId}
                onClick={() => run(f.userId, () => supabase.rpc("locapass_follow_back", { p_user_id: f.userId, p_follow: !f.iFollowBack }))}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  f.iFollowBack ? "border border-main/20 text-tone-100" : "bg-gradient-to-r from-cta-light to-cta text-on-cta"
                }`}
              >
                {f.iFollowBack ? "フォロー中" : "フォローバック"}
              </button>
              <button
                type="button"
                disabled={busyId === f.userId}
                onClick={() => {
                  if (!window.confirm(`${f.nickname}をブロックしますか?`)) return;
                  void run(f.userId, () => supabase.rpc("locapass_block_user", { p_user_id: f.userId, p_block: true }));
                }}
                className="shrink-0 text-[11px] text-red-400 disabled:opacity-50"
              >
                ブロック
              </button>
            </li>
          ))}
        </ul>
      )}

      {blocked.length > 0 && (
        <div className="mt-4 border-t border-main/10 pt-3">
          <p className="text-[11px] font-semibold text-tone-500">ブロック中</p>
          <ul className="mt-2 space-y-2">
            {blocked.map((b) => (
              <li key={b.userId} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-tone-300">{b.nickname}</span>
                <button
                  type="button"
                  disabled={busyId === b.userId}
                  onClick={() => run(b.userId, () => supabase.rpc("locapass_block_user", { p_user_id: b.userId, p_block: false }))}
                  className="shrink-0 rounded-full border border-main/20 px-3 py-1 text-xs text-tone-100 disabled:opacity-50"
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
