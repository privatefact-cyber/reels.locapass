"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { containsNgWord } from "@/lib/reels/ngWords";

const MAX_LEN = 15;

type CommentRow = {
  id: string;
  body: string;
  author_type: "customer" | "staff" | "cast";
  user_id: string | null;
  parent_comment_id: string | null;
  created_at: string;
  reel_id: string;
};

/** キャストのマイページに置く「ついたコメント一覧」パネル。返信・削除・ブロック(シャドウバン)をここで完結させる。 */
export function CastCommentsPanel({ castId }: { castId: string }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("reel_comments")
      .select("id, body, author_type, user_id, parent_comment_id, created_at, reel_id, reels!inner(cast_id)")
      .eq("reels.cast_id", castId)
      .order("created_at", { ascending: false });
    setComments((data as unknown as CommentRow[]) ?? []);
    setLoading(false);
  }, [castId]);

  useEffect(() => {
    load();
  }, [load]);

  const topLevels = comments.filter((c) => c.author_type === "customer");
  const repliesByParent = new Map(
    comments.filter((c) => c.author_type === "cast" && c.parent_comment_id).map((c) => [c.parent_comment_id, c]),
  );

  async function reply(parentCommentId: string, reelId: string, body: string) {
    const trimmed = body.trim().slice(0, MAX_LEN);
    if (!trimmed || busyId) return;
    if (containsNgWord(trimmed)) {
      setError("この内容は投稿できません。表現を変えてお試しください。");
      return;
    }
    setBusyId(parentCommentId);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("reel_comments").insert({
      reel_id: reelId,
      author_type: "cast",
      cast_id: castId,
      parent_comment_id: parentCommentId,
      body: trimmed,
    });
    if (insertError) setError("返信できませんでした。");
    else {
      setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: "" }));
      await load();
    }
    setBusyId(null);
  }

  async function remove(commentId: string) {
    if (busyId) return;
    setBusyId(commentId);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("reel_comments")
      .update({ is_deleted: true })
      .eq("id", commentId);
    if (updateError) setError("削除できませんでした。");
    else await load();
    setBusyId(null);
  }

  async function block(userId: string | null) {
    if (busyId || !userId) return;
    if (!window.confirm("このユーザーをブロックしますか?今後のコメントはあなた以外から見えなくなります。")) return;
    setBusyId(userId);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("cast_blocked_users")
      .insert({ cast_id: castId, blocked_user_id: userId });
    if (insertError) setError("ブロックできませんでした。");
    else await load();
    setBusyId(null);
  }

  if (loading) return null;

  return (
    <div className="mt-8 border-t border-white/10 px-4 pt-6">
      <h2 className="mb-3 text-sm font-semibold text-white">ついたコメント</h2>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {topLevels.length === 0 ? (
        <p className="text-xs text-neutral-500">まだコメントはありません。</p>
      ) : (
        <ul className="space-y-3">
          {topLevels.map((c) => {
            const reply_ = repliesByParent.get(c.id);
            return (
              <li key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white">{c.body}</p>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => remove(c.id)}
                      className="text-[10px] text-neutral-400 underline disabled:opacity-40"
                    >
                      削除
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.user_id}
                      onClick={() => block(c.user_id)}
                      className="text-[10px] text-neutral-400 underline disabled:opacity-40"
                    >
                      ブロック
                    </button>
                  </div>
                </div>
                {reply_ ? (
                  <p className="mt-2 text-xs text-brand">返信済み: {reply_.body}</p>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={replyDrafts[c.id] ?? ""}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value.slice(0, MAX_LEN) }))}
                      maxLength={MAX_LEN}
                      placeholder="返信する(15文字以内)"
                      className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white placeholder:text-neutral-500"
                    />
                    <button
                      type="button"
                      disabled={busyId === c.id || !(replyDrafts[c.id] ?? "").trim()}
                      onClick={() => reply(c.id, c.reel_id, replyDrafts[c.id] ?? "")}
                      className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      返信
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
