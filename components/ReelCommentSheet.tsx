"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { containsNgWord } from "@/lib/reels/ngWords";
import { useLocale } from "@/components/i18n/LocaleProvider";

const MAX_LEN = 15;
const STAMPS = ["😍", "🥰", "😂", "🔥", "👍", "🙏", "🎉", "😢"];

type CommentRow = {
  id: string;
  body: string;
  author_type: "customer" | "staff" | "cast";
  user_id: string | null;
  cast_id: string | null;
  parent_comment_id: string | null;
  created_at: string;
};

type Role = "checking" | "guest" | "customer" | "cast";

type CommenterProfile = { nickname: string; avatarUrl: string | null };

/** リールのコメント欄(客1人につき1コメント→キャスト本人が1回だけ返信、で終わる1往復のみの簡易スレッド)。 */
export function ReelCommentSheet({
  reelId,
  reelCastId,
  commentsEnabled = true,
  onClose,
}: {
  reelId: string;
  reelCastId: string | null;
  commentsEnabled?: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [role, setRole] = useState<Role>("checking");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [commenterProfiles, setCommenterProfiles] = useState<Record<string, CommenterProfile>>({});

  const loadComments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("reel_comments")
      .select("id, body, author_type, user_id, cast_id, parent_comment_id, created_at")
      .eq("reel_id", reelId)
      .order("created_at", { ascending: true });
    const rows = (data as CommentRow[]) ?? [];
    setComments(rows);

    // キャストには誰がコメントしたか最低限(ニックネーム・アイコン)わかるようにする。
    // RLSで「自分のリールにコメントした客」以外のプロフィールは取れない(取れても0件)。
    const customerIds = Array.from(
      new Set(rows.filter((r) => r.author_type === "customer" && r.user_id).map((r) => r.user_id as string)),
    );
    if (customerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("locapass_members")
        .select("id, nickname, avatar_url")
        .in("id", customerIds);
      const map: Record<string, CommenterProfile> = {};
      for (const p of profiles ?? []) {
        map[p.id] = { nickname: p.nickname, avatarUrl: p.avatar_url };
      }
      setCommenterProfiles(map);
    }
  }, [reelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setRole("guest");
      } else {
        setMyUserId(user.id);
        const { data: currentCastId } = await supabase.rpc("current_cast_id");
        if (!cancelled) {
          setRole(currentCastId && reelCastId && currentCastId === reelCastId ? "cast" : "customer");
        }
      }

      await loadComments();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadComments, reelCastId]);

  const topLevels = comments.filter((c) => c.author_type === "customer");
  const repliesByParent = new Map(
    comments.filter((c) => c.author_type === "cast" && c.parent_comment_id).map((c) => [c.parent_comment_id, c]),
  );
  const myComment = myUserId ? topLevels.find((c) => c.user_id === myUserId) : undefined;

  async function postComment(body: string) {
    const trimmed = body.trim().slice(0, MAX_LEN);
    if (!trimmed || posting) return;
    if (containsNgWord(trimmed)) {
      setError(t.comment.ngWord);
      return;
    }
    setPosting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("reel_comments")
      .insert({ reel_id: reelId, author_type: "customer", body: trimmed });
    if (insertError) {
      setError(
        insertError.message.includes("ng_word_detected") ? t.comment.ngWord : t.comment.postFailed,
      );
    } else {
      setComposerText("");
      await loadComments();
    }
    setPosting(false);
  }

  async function postReply(parentCommentId: string, body: string) {
    const trimmed = body.trim().slice(0, MAX_LEN);
    if (!trimmed || posting || !reelCastId) return;
    if (containsNgWord(trimmed)) {
      setError(t.comment.ngWord);
      return;
    }
    setPosting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("reel_comments").insert({
      reel_id: reelId,
      author_type: "cast",
      cast_id: reelCastId,
      parent_comment_id: parentCommentId,
      body: trimmed,
    });
    if (insertError) {
      setError(
        insertError.message.includes("ng_word_detected") ? t.comment.ngWord : t.comment.replyFailed,
      );
    } else {
      setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: "" }));
      await loadComments();
    }
    setPosting(false);
  }

  async function deleteComment(commentId: string) {
    if (posting) return;
    setPosting(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("reel_comments")
      .update({ is_deleted: true })
      .eq("id", commentId);
    if (updateError) {
      setError(t.comment.deleteFailed);
    } else {
      await loadComments();
    }
    setPosting(false);
  }

  async function blockCommenter(blockedUserId: string | null) {
    if (posting || !blockedUserId || !reelCastId) return;
    setPosting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("cast_blocked_users")
      .insert({ cast_id: reelCastId, blocked_user_id: blockedUserId });
    if (insertError) {
      setError(t.comment.blockFailed);
    } else {
      await loadComments();
    }
    setPosting(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col rounded-t-2xl bg-neutral-950 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold">{t.comment.title}</p>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="p-1 text-white/70">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-center text-xs text-white/50">{t.common.loading}</p>
          ) : topLevels.length === 0 ? (
            <p className="text-center text-xs text-white/50">{t.comment.empty}</p>
          ) : (
            topLevels.map((c) => {
              const reply = repliesByParent.get(c.id);
              const isMine = c.user_id === myUserId;
              const canModerate = role === "cast";
              const commenter = c.user_id ? commenterProfiles[c.user_id] : undefined;
              return (
                <div key={c.id} className="space-y-1.5">
                  {canModerate && !isMine && commenter && (
                    <div className="flex items-center gap-1.5">
                      {commenter.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={commenter.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-white/20" />
                      )}
                      <span className="text-[10px] text-white/50">{commenter.nickname}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="rounded-2xl bg-white/10 px-3 py-1.5 text-sm">{c.body}</span>
                    {isMine && <span className="mt-1.5 text-[10px] text-white/40">{t.comment.you}</span>}
                    {(isMine || canModerate) && (
                      <button
                        type="button"
                        disabled={posting}
                        onClick={() => deleteComment(c.id)}
                        className="mt-1 text-[10px] text-white/40 underline disabled:opacity-40"
                      >
                        {t.comment.delete}
                      </button>
                    )}
                    {canModerate && c.user_id && (
                      <button
                        type="button"
                        disabled={posting}
                        onClick={() => blockCommenter(c.user_id)}
                        className="mt-1 text-[10px] text-white/40 underline disabled:opacity-40"
                      >
                        {t.comment.block}
                      </button>
                    )}
                  </div>
                  {reply && (
                    <div className="ml-4 flex items-start gap-2">
                      <span className="rounded-2xl bg-gold/20 px-3 py-1.5 text-sm text-gold">{reply.body}</span>
                      <span className="mt-1.5 text-[10px] text-white/40">{t.comment.fromCast}</span>
                      {canModerate && (
                        <button
                          type="button"
                          disabled={posting}
                          onClick={() => deleteComment(reply.id)}
                          className="mt-1 text-[10px] text-white/40 underline disabled:opacity-40"
                        >
                          {t.comment.delete}
                        </button>
                      )}
                    </div>
                  )}
                  {!reply && role === "cast" && commentsEnabled && (
                    <div className="ml-4 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={replyDrafts[c.id] ?? ""}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value.slice(0, MAX_LEN) }))
                        }
                        maxLength={MAX_LEN}
                        placeholder={t.comment.replyPlaceholder}
                        className="w-40 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white placeholder:text-white/30"
                      />
                      <button
                        type="button"
                        disabled={posting || !(replyDrafts[c.id] ?? "").trim()}
                        onClick={() => postReply(c.id, replyDrafts[c.id] ?? "")}
                        className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-black disabled:opacity-40"
                      >
                        {t.comment.reply}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {error && <p className="px-4 pb-1 text-xs text-red-400">{error}</p>}

        <div className="border-t border-white/10 px-4 py-3">
          {!commentsEnabled ? (
            <p className="text-center text-xs text-white/40">{t.comment.disabled}</p>
          ) : (
            <>
              {role === "guest" && (
                <Link
                  href={`/mypage/login?redirect=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.pathname : "/",
                  )}`}
                  className="block w-full rounded-full bg-gold py-2 text-center text-sm font-semibold text-black"
                >
                  {t.comment.loginToComment}
                </Link>
              )}

              {role === "customer" && !myComment && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {STAMPS.map((stamp) => (
                      <button
                        key={stamp}
                        type="button"
                        disabled={posting}
                        onClick={() => postComment(stamp)}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-lg leading-none disabled:opacity-40"
                      >
                        {stamp}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value.slice(0, MAX_LEN))}
                      maxLength={MAX_LEN}
                      placeholder={t.comment.commentPlaceholder}
                      className="flex-1 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      disabled={posting || !composerText.trim()}
                      onClick={() => postComment(composerText)}
                      className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {t.comment.send}
                    </button>
                  </div>
                </div>
              )}

              {role === "customer" && myComment && (
                <p className="text-center text-xs text-white/40">
                  {t.comment.alreadyCommented}
                </p>
              )}

              {role === "cast" && (
                <p className="text-center text-xs text-white/40">
                  {t.comment.castReplyHint}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
