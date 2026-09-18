"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getViewerId } from "@/lib/reels/viewer-id";

interface ThreadMessage {
  senderType: "customer" | "shop";
  body: string;
  createdAt: string;
}

interface Thread {
  id: string;
  shopId: string;
  shopName: string;
  status: string;
  messages: ThreadMessage[];
}

export default function InquiryThreadPage() {
  const params = useParams<{ id: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("get_inquiry_thread", { p_inquiry_id: params.id, p_viewer_id: getViewerId() })
      .single();

    if (error || !data) {
      setNotFoundError(true);
      setLoading(false);
      return;
    }

    setThread({
      id: data.id,
      shopId: data.shop_id,
      shopName: data.shop_name,
      status: data.status,
      messages: (data.messages as unknown as ThreadMessage[]) ?? [],
    });
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("add_inquiry_message", {
      p_inquiry_id: params.id,
      p_viewer_id: getViewerId(),
      p_body: reply,
    });

    setSending(false);
    if (!error) {
      setReply("");
      void load();
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-md px-4 py-10 text-center text-sm text-neutral-500">読み込み中...</div>;
  }

  if (notFoundError || !thread) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-neutral-500">この問い合わせは見つかりませんでした。</p>
        <Link href="/inquiries" className="mt-3 inline-block text-xs text-amber-400">
          問い合わせ一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-md flex-col px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/inquiries" aria-label="戻る" className="text-neutral-400">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-sm font-bold text-neutral-100">{thread.shopName}</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {thread.messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.senderType === "shop"
                ? "ml-0 bg-zinc-800 text-neutral-100"
                : "ml-auto bg-gradient-to-r from-amber-400 to-amber-500 text-zinc-950"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[10px] opacity-60">
              {new Date(m.createdAt).toLocaleString("ja-JP")}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="mt-3 flex gap-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="メッセージを入力"
          className="flex-1 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[16px] text-white"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </div>
  );
}
