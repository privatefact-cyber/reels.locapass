"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Thread = { id: string; userNickname: string; lastMessageAt: string };
type Message = { id: string; senderType: "user" | "staff"; body: string; createdAt: string };

/** FACES本人の画面のDM。相互フォローのユーザーだけがスレッドを作れ、フォローが外れる/ブロックすると返信できなくなる。 */
export function CastDmPanel({ castId }: { castId: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("locapass_staff_dm_threads")
      .select("id, user_nickname, last_message_at")
      .eq("cast_id", castId)
      .order("last_message_at", { ascending: false })
      .then(({ data }) =>
        setThreads((data ?? []).map((t) => ({ id: t.id, userNickname: t.user_nickname, lastMessageAt: t.last_message_at }))),
      );
  }, [castId]);

  const fetchMessages = useCallback(async (threadId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("locapass_staff_dm_messages")
      .select("id, sender_type, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        senderType: m.sender_type as "user" | "staff",
        body: m.body,
        createdAt: m.created_at,
      })),
    );
  }, []);

  // 開いている間の新着をRealtimeで反映する(RLSがそのまま効く)。
  useEffect(() => {
    if (!openId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`locapass_cast_dm:${openId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "locapass_staff_dm_messages", filter: `thread_id=eq.${openId}` },
        (payload) => {
          const m = payload.new as { id: string; sender_type: "user" | "staff"; body: string; created_at: string };
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id, senderType: m.sender_type, body: m.body, createdAt: m.created_at }],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [openId]);

  async function toggle(id: string) {
    setError(null);
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLoading(true);
    await fetchMessages(id);
    setLoading(false);
  }

  async function send(threadId: string) {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locapass_staff_dm_messages")
      .insert({ thread_id: threadId, sender_type: "staff", body: draft.trim() })
      .select("id, sender_type, body, created_at")
      .single();
    setSending(false);
    if (insertError || !data) {
      setError("送信できませんでした。相互フォローが解除された、またはブロック中の可能性があります。");
      return;
    }
    setMessages((prev) =>
      prev.some((x) => x.id === data.id) ? prev : [...prev, { id: data.id, senderType: "staff", body: data.body, createdAt: data.created_at }],
    );
    setDraft("");
  }

  return (
    <section className="mx-4 mt-6 rounded-2xl border border-main/10 bg-surface p-4">
      <h2 className="text-sm font-bold text-tone-100">メッセージ</h2>
      <p className="mt-1 text-[11px] text-tone-500">相互フォローのユーザーとだけやり取りできます。</p>
      {threads === null ? (
        <p className="mt-3 text-xs text-tone-500">読み込み中...</p>
      ) : threads.length === 0 ? (
        <p className="mt-3 text-xs text-tone-500">まだメッセージはありません。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {threads.map((t) => (
            <li key={t.id} className="rounded-xl border border-main/10">
              <button type="button" onClick={() => toggle(t.id)} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left">
                <p className="text-sm font-semibold text-main">{t.userNickname}</p>
                <span className="text-xs text-tone-500">{new Date(t.lastMessageAt).toLocaleString("ja-JP")}</span>
              </button>
              {openId === t.id && (
                <div className="space-y-2 border-t border-main/10 p-3">
                  {loading ? (
                    <p className="text-xs text-tone-500">読み込み中...</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs ${
                          m.senderType === "staff" ? "ml-auto bg-brand text-main" : "mr-auto bg-main/10 text-tone-200"
                        }`}
                      >
                        {m.body}
                      </div>
                    ))
                  )}
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="返信を入力"
                      className="flex-1 rounded border border-main/20 bg-main/5 px-2 py-1.5 text-[13px] text-main"
                    />
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => send(t.id)}
                      className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-main disabled:opacity-50"
                    >
                      送信
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
