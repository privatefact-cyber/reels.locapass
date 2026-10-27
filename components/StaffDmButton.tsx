"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DmAttachButtons } from "@/components/dm/DmAttachButtons";
import { DmEmojiButton } from "@/components/dm/DmEmojiButton";
import { DmMessageContent } from "@/components/dm/DmMessageContent";

type Message = { id: string; senderType: "user" | "staff"; body: string; imagePath: string | null; createdAt: string };

/**
 * スタッフ公開ページのDMボタン。ログイン不要の匿名お問い合わせ(InquiryButton/locapass_shop_inquiries)
 * とは違い、登録ユーザー本人とスタッフ本人が直接やり取りする1対1スレッド(locapass_staff_dm_threads)を使う。
 * 未ログインならログインを促すだけで、ゲストのまま送信はできない。
 */
type DmStatus = { available: boolean; i_follow: boolean; follows_me: boolean; blocked_by_me: boolean; open: boolean };

export function StaffDmButton({
  staffId,
  castId,
  staffName,
  variant = "button",
}: {
  /** スタッフ宛てならstaffId、FACES宛てならcastId(どちらか一方)。 */
  staffId?: string;
  castId?: string;
  staffName: string;
  /** "icon": Instagramのプロフィール統計行に置く丸アイコン版。既定は全幅ボタン。 */
  variant?: "button" | "icon";
}) {
  const pathname = usePathname();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DmStatus | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("locapass_dm_status", { p_staff_id: staffId, p_cast_id: castId });
    const next = (data as DmStatus | null) ?? null;
    setStatus(next);
    return next;
  }, [staffId, castId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setCheckingAuth(false);
      if (data.user) void refreshStatus();
    });
  }, [refreshStatus]);

  async function toggleFollow() {
    if (!status) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("locapass_dm_follow", { p_staff_id: staffId, p_cast_id: castId, p_follow: !status.i_follow });
    await refreshStatus();
    setBusy(false);
  }

  async function toggleBlock() {
    if (!status) return;
    if (!status.blocked_by_me && !window.confirm(`${staffName}をブロックしますか?フォローも双方向で外れ、メッセージは送れなくなります。`)) {
      return;
    }
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("locapass_dm_block", { p_staff_id: staffId, p_cast_id: castId, p_block: !status.blocked_by_me });
    await refreshStatus();
    setBusy(false);
    if (!status.blocked_by_me) setOpen(false);
  }

  async function fetchMessages(id: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("locapass_staff_dm_messages")
      .select("id, sender_type, body, image_path, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        senderType: m.sender_type as "user" | "staff",
        body: m.body,
        imagePath: m.image_path,
        createdAt: m.created_at,
      })),
    );
  }

  async function handleOpen() {
    setError(null);
    // 相互フォローになっていないうちはDMを開かず、フォロー案内を出す。
    const latest = await refreshStatus();
    if (!latest?.open) {
      setGateOpen(true);
      return;
    }
    setOpen(true);
    setLoadingThread(true);
    const supabase = createClient();
    const { data: id, error: rpcError } = await supabase.rpc("locapass_get_or_create_dm_thread", {
      p_staff_id: staffId,
      p_cast_id: castId,
    });
    if (rpcError || !id) {
      setError("メッセージ画面を開けませんでした");
      setLoadingThread(false);
      return;
    }
    setThreadId(id);
    await fetchMessages(id);
    setLoadingThread(false);
  }

  // モーダルを開いている間、相手からの新着メッセージをRealtimeで即時反映する
  // (大規模運用を見据え、ポーリングではなくpush配信にする。RLSはそのまま効く)。
  useEffect(() => {
    if (!open || !threadId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`locapass_staff_dm_messages:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "locapass_staff_dm_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const m = payload.new as { id: string; sender_type: "user" | "staff"; body: string; image_path: string | null; created_at: string };
          setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [
            ...prev,
            { id: m.id, senderType: m.sender_type, body: m.body, imagePath: m.image_path, createdAt: m.created_at },
          ]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, threadId]);

  async function handleSend() {
    if (!threadId || !draft.trim()) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locapass_staff_dm_messages")
      .insert({ thread_id: threadId, sender_type: "user", body: draft.trim() })
      .select("id, sender_type, body, image_path, created_at")
      .single();
    setSending(false);
    if (insertError || !data) {
      // フォロー解除・ブロックで途中から送れなくなった場合は、案内画面に切り替える。
      const latest = await refreshStatus();
      if (!latest?.open) {
        setOpen(false);
        setGateOpen(true);
        return;
      }
      setError("送信に失敗しました");
      return;
    }
    setMessages((prev) => [
      ...prev,
      { id: data.id, senderType: "user", body: data.body, imagePath: data.image_path, createdAt: data.created_at },
    ]);
    setDraft("");
  }

  if (checkingAuth) return null;
  if (loggedIn && status && !status.available) return null;

  if (!loggedIn) {
    if (variant === "icon") {
      return (
        <Link
          href={`/mypage/login?redirect=${encodeURIComponent(pathname)}`}
          aria-label="ログインしてメッセージを送る"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-main/15 text-tone-300 transition hover:border-hl-400/50 hover:text-hl-300"
        >
          <MessageCircle size={16} />
        </Link>
      );
    }
    return (
      <Link
        href={`/mypage/login?redirect=${encodeURIComponent(pathname)}`}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-line/40 bg-hl-500/10 px-4 py-3 text-sm font-semibold text-hl-300 backdrop-blur-xl transition hover:bg-hl-500/20"
      >
        <MessageCircle size={16} />
        ログインしてメッセージを送る
      </Link>
    );
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="メッセージを送る"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-main/15 text-tone-300 transition hover:border-hl-400/50 hover:text-hl-300"
        >
          <MessageCircle size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-line/40 bg-hl-500/10 px-4 py-3 text-sm font-semibold text-hl-300 backdrop-blur-xl transition hover:bg-hl-500/20"
        >
          <MessageCircle size={16} />
          メッセージを送る
        </button>
      )}


      {gateOpen && status && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={() => setGateOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl border border-line/20 bg-panel-950 p-5 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-tone-100">{staffName}にメッセージ</h2>
              <button type="button" onClick={() => setGateOpen(false)} aria-label="閉じる" className="text-muted">
                <X size={18} />
              </button>
            </div>
            {status.blocked_by_me ? (
              <>
                <p className="mt-3 text-xs leading-relaxed text-tone-500">ブロック中のため、メッセージは送れません。</p>
                <button
                  type="button"
                  onClick={toggleBlock}
                  disabled={busy}
                  className="mt-4 w-full rounded-full border border-main/20 px-4 py-2.5 text-sm font-semibold text-tone-100 disabled:opacity-50"
                >
                  ブロックを解除する
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-tone-500">
                  メッセージは、お互いにフォローしているときだけ送れます。
                  {status.i_follow
                    ? status.follows_me
                      ? ""
                      : "フォロー済みです。相手がフォローを返すと送れるようになります。"
                    : status.follows_me
                      ? "相手はあなたをフォローしています。フォローを返すと送れるようになります。"
                      : "まずフォローして、相手がフォローを返すのを待ちましょう。"}
                </p>
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={busy}
                  className={`mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                    status.i_follow
                      ? "border border-main/20 text-tone-100"
                      : "bg-gradient-to-r from-cta-light to-cta text-on-cta"
                  }`}
                >
                  {status.i_follow ? "フォロー中(タップで解除)" : status.follows_me ? "フォローバックする" : "フォローする"}
                </button>
                <button type="button" onClick={toggleBlock} disabled={busy} className="mt-3 w-full text-center text-xs text-red-400">
                  ブロックする
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[70vh] w-full max-w-sm flex-col rounded-t-2xl border border-line/20 bg-panel-950 p-5 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-tone-100">{staffName}とのメッセージ</h2>
              <div className="flex items-center gap-3">
                <button type="button" onClick={toggleBlock} disabled={busy} className="text-[11px] text-red-400">
                  ブロック
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="text-muted">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
              {loadingThread ? (
                <p className="text-xs text-tone-500">読み込み中...</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-tone-500">まだメッセージはありません。最初のメッセージを送ってみましょう。</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                      m.senderType === "user"
                        ? "ml-auto bg-gradient-to-r from-cta-light to-cta text-on-cta"
                        : "mr-auto bg-main/10 text-tone-100"
                    }`}
                  >
                    <DmMessageContent body={m.body} imagePath={m.imagePath} />
                  </div>
                ))
              )}
            </div>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <div className="mt-3 flex gap-2">
              {threadId && (
                <DmAttachButtons
                  threadId={threadId}
                  senderType="user"
                  onSent={(m) =>
                    setMessages((prev) =>
                      prev.some((x) => x.id === m.id)
                        ? prev
                        : [...prev, { id: m.id, senderType: "user", body: m.body, imagePath: m.image_path, createdAt: m.created_at }],
                    )
                  }
                  onError={async (message) => {
                    const latest = await refreshStatus();
                    if (!latest?.open) {
                      setOpen(false);
                      setGateOpen(true);
                    } else {
                      setError(message);
                    }
                  }}
                />
              )}
              <DmEmojiButton onPick={(e) => setDraft((d) => d + e)} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder="メッセージを入力"
                className="flex-1 rounded-full border border-main/20 bg-main/5 px-4 py-2 text-[16px] text-main"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="rounded-full bg-gradient-to-r from-cta-light to-cta px-4 py-2 text-sm font-semibold text-on-cta disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
