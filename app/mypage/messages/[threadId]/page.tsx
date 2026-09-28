"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; senderType: "user" | "staff"; body: string; createdAt: string };

/** 登録ユーザー本人とスタッフのDMスレッド。本人以外はRLSで弾かれる。 */
export default function StaffDmThreadPage() {
  const params = useParams<{ threadId: string }>();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [notFoundError, setNotFoundError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("locapass_staff_dm_messages")
      .select("id, sender_type, body, created_at")
      .eq("thread_id", params.threadId)
      .order("created_at", { ascending: true });

    if (error) {
      setNotFoundError(true);
      return;
    }
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        senderType: m.sender_type as "user" | "staff",
        body: m.body,
        createdAt: m.created_at,
      })),
    );
  }, [params.threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 開いている間、スタッフからの新着返信をRealtimeで即時反映する
  // (大規模運用を見据え、ポーリングではなくpush配信にする。RLSはそのまま効く)。
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`locapass_staff_dm_messages_thread:${params.threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "locapass_staff_dm_messages",
          filter: `thread_id=eq.${params.threadId}`,
        },
        (payload) => {
          const m = payload.new as { id: string; sender_type: "user" | "staff"; body: string; created_at: string };
          setMessages((prev) =>
            prev && !prev.some((existing) => existing.id === m.id)
              ? [...prev, { id: m.id, senderType: m.sender_type, body: m.body, createdAt: m.created_at }]
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [params.threadId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("locapass_staff_dm_messages")
      .insert({ thread_id: params.threadId, sender_type: "user", body: draft.trim() });

    setSending(false);
    if (!error) {
      setDraft("");
      void load();
    }
  }

  if (messages === null && !notFoundError) {
    return <div className="mx-auto max-w-md px-4 py-10 text-center text-sm text-tone-500">読み込み中...</div>;
  }

  if (notFoundError || !messages) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-tone-500">このメッセージは見つかりませんでした。</p>
        <Link href="/mypage/messages" className="mt-3 inline-block text-xs text-hl-400">
          メッセージ一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-md flex-col px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/mypage/messages" aria-label="戻る" className="text-muted">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-sm font-bold text-tone-100">メッセージ</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-center text-xs text-tone-500">まだメッセージはありません。</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.senderType === "staff"
                ? "ml-0 bg-panel-800 text-tone-100"
                : "ml-auto bg-gradient-to-r from-hl-400 to-hl-500 text-panel-950"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[10px] opacity-60">{new Date(m.createdAt).toLocaleString("ja-JP")}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="メッセージを入力"
          className="flex-1 rounded-full border border-main/20 bg-main/5 px-4 py-2 text-[16px] text-main"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-gradient-to-r from-cta-light to-cta px-4 py-2 text-sm font-semibold text-on-cta disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </div>
  );
}
