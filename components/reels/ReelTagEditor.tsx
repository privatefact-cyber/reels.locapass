"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_TAGS_PER_REEL, TAG_DEFS } from "@/lib/reels/tags/vocabulary";

const LABEL: Record<string, string> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t.labels.ja]));

/**
 * タグ(AIが自動で付けた分類)を直すモーダル。投稿者・店舗スタッフが外す/足すことができる。
 * 選べるのは店舗の業種に合うタグだけ・最大4つ。動画ストックの絞り込みに使われる。
 */
function TagEditorModal({ reelId, onClose }: { reelId: string; onClose: () => void }) {
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reels/${reelId}/tags?v=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { tags?: string[]; allowed?: string[]; status?: string | null } | null) => {
        if (cancelled) return;
        setAllowed(json?.allowed ?? []);
        setSelected(json?.tags ?? []);
        setInitial(json?.tags ?? []);
        setStatus(json?.status ?? null);
      })
      .catch(() => !cancelled && setAllowed([]));
    return () => {
      cancelled = true;
    };
  }, [reelId]);

  const changed = selected.join(",") !== initial.join(",");

  function toggle(id: string) {
    setMessage(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TAGS_PER_REEL) {
        setMessage(`タグは${MAX_TAGS_PER_REEL}つまでです`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: selected }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "保存に失敗しました");
        return;
      }
      setInitial(selected);
      setMessage("保存しました(動画ストックへの反映まで最大1分ほどかかります)");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white text-slate-900 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold">タグを編集</h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 underline">
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {allowed === null ? (
            <p className="py-6 text-center text-sm text-slate-500">読み込み中…</p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-slate-500">
                投稿するとAIが自動でタグを付けます(数十秒かかります)。違っていたら、ここで直せます。最大{MAX_TAGS_PER_REEL}つ。
                {status === "pending" && " いまAIが処理中です。"}
                {status === null && " まだ付いていません。"}
              </p>
              <div className="flex flex-wrap gap-2">
                {allowed.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      selected.includes(id) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {LABEL[id] ?? id}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-3">
          {message && <p className="mb-2 text-xs text-slate-600">{message}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || !changed}
              onClick={save}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** リール一覧の各サムネイルに置く「タグ」ボタン。押すと編集モーダルが開く。 */
export function ReelTagEditButton({ reelId, className }: { reelId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={className ?? "rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"}
      >
        タグ
      </button>
      {open && <TagEditorModal reelId={reelId} onClose={() => setOpen(false)} />}
    </>
  );
}
