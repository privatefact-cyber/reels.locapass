"use client";

import { useEffect, useState } from "react";
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
  const [busyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // 本家は reel_comments / cast_blocked_users を読み書きする。locapass にはコメントの受け皿が無いため、
  // 一覧は空で表示し、返信・削除・ブロックは「未接続」を返す。
  useEffect(() => {
    setComments([]);
    setLoading(false);
  }, [castId]);

  const topLevels = comments.filter((c) => c.author_type === "customer");
  const repliesByParent = new Map(
    comments.filter((c) => c.author_type === "cast" && c.parent_comment_id).map((c) => [c.parent_comment_id, c]),
  );

  async function reply(_parentCommentId: string, _reelId: string, body: string) {
    const trimmed = body.trim().slice(0, MAX_LEN);
    if (!trimmed || busyId) return;
    if (containsNgWord(trimmed)) {
      setError("この内容は投稿できません。表現を変えてお試しください。");
      return;
    }
    setError("この機能はまだlocapassのデータベースに接続されていません");
  }

  async function remove(_commentId: string) {
    if (busyId) return;
    setError("この機能はまだlocapassのデータベースに接続されていません");
  }

  async function block(userId: string | null) {
    if (busyId || !userId) return;
    setError("この機能はまだlocapassのデータベースに接続されていません");
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
