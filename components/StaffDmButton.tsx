"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; senderType: "user" | "staff"; body: string; createdAt: string };

/**
 * スタッフ公開ページのDMボタン。ログイン不要の匿名お問い合わせ(InquiryButton/locapass_shop_inquiries)
 * とは違い、登録ユーザー本人とスタッフ本人が直接やり取りする1対1スレッド(locapass_staff_dm_threads)を使う。
 * 未ログインならログインを促すだけで、ゲストのまま送信はできない。
 */
export function StaffDmButton({
  staffId,
  staffName,
  variant = "button",
}: {
  staffId: string;
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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setCheckingAuth(false);
    });
  }, []);

  async function fetchMessages(id: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("locapass_staff_dm_messages")
      .select("id, sender_type, body, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        senderType: m.sender_type as "user" | "staff",
        body: m.body,
        createdAt: m.created_at,
      })),
    );
  }

  async function handleOpen() {
    setOpen(true);
    setError(null);
    setLoadingThread(true);
    const supabase = createClient();
    const { data: id, error: rpcError } = await supabase.rpc("locapass_get_or_create_staff_dm_thread", {
      p_staff_id: staffId,
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

  // モーダルを開いている間、相手からの新着メッセージを自動で反映する(リロード不要にするため)。
  useEffect(() => {
    if (!open || !threadId) return;
    const interval = setInterval(() => {
      void fetchMessages(threadId);
    }, 4000);
    return () => clearInterval(interval);
  }, [open, threadId]);

  async function handleSend() {
    if (!threadId || !draft.trim()) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locapass_staff_dm_messages")
      .insert({ thread_id: threadId, sender_type: "user", body: draft.trim() })
      .select("id, sender_type, body, created_at")
      .single();
    setSending(false);
    if (insertError || !data) {
      setError("送信に失敗しました");
      return;
    }
    setMessages((prev) => [
      ...prev,
      { id: data.id, senderType: "user", body: data.body, createdAt: data.created_at },
    ]);
    setDraft("");
  }

  if (checkingAuth) return null;

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
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="text-muted">
                <X size={18} />
              </button>
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
                    {m.body}
                  </div>
                ))
              )}
            </div>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <div className="mt-3 flex gap-2">
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
