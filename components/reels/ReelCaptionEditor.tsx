"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Cue = { s: number; e: number; t: string };
type Lang = "ja" | "en" | "zh";
const LANGS: { code: Lang; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 字幕の文言を直すモーダル。誤認識・誤訳を投稿者が直せる。
 * 直せるのは文言だけ(時刻と台詞の件数は固定)。全部消すこともできる。
 */
function CaptionEditorModal({ reelId, onClose }: { reelId: string; onClose: () => void }) {
  const [data, setData] = useState<Partial<Record<Lang, Cue[]>> | null>(null);
  const [lang, setLang] = useState<Lang>("ja");
  const [drafts, setDrafts] = useState<Partial<Record<Lang, string[]>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // CDNの古い応答を避けるため、毎回違うクエリで取りに行く。
    Promise.all(
      LANGS.map(async ({ code }) => {
        const res = await fetch(`/api/reels/${reelId}/captions?lang=${code}&v=${Date.now()}`);
        const json = res.ok ? ((await res.json()) as { cues?: Cue[] }) : { cues: [] };
        return [code, Array.isArray(json.cues) ? json.cues : []] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Partial<Record<Lang, Cue[]>> = {};
        const nextDrafts: Partial<Record<Lang, string[]>> = {};
        for (const [code, cues] of entries) {
          if (cues.length > 0) {
            next[code] = cues;
            nextDrafts[code] = cues.map((c) => c.t);
          }
        }
        setData(next);
        setDrafts(nextDrafts);
        const first = LANGS.find((l) => next[l.code]);
        if (first) setLang(first.code);
      })
      .catch(() => !cancelled && setData({}));
    return () => {
      cancelled = true;
    };
  }, [reelId]);

  const cues = data?.[lang] ?? [];
  const draft = drafts[lang] ?? [];
  const changed = cues.some((c, i) => (draft[i] ?? c.t) !== c.t);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/captions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, texts: draft }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "保存に失敗しました");
        return;
      }
      setData((prev) => ({ ...prev, [lang]: cues.map((c, i) => ({ ...c, t: draft[i].trim() })) }));
      setMessage("保存しました(反映まで最大5分ほどかかります)");
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (!confirm("このリールの字幕をすべて消しますか?(自動では作り直されません)")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/captions`, { method: "DELETE" });
      if (!res.ok) {
        setMessage("削除に失敗しました");
        return;
      }
      setData({});
      setDrafts({});
      setMessage("字幕を削除しました");
    } finally {
      setBusy(false);
    }
  }

  const available = LANGS.filter((l) => data?.[l.code]);

  return createPortal(
    // モーダルの中のクリックが、親(リールのリンク等)に伝わって画面遷移しないようにする。
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
          <h2 className="text-sm font-bold">字幕を編集</h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 underline">
            閉じる
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {data === null ? (
            <p className="py-6 text-center text-sm text-slate-500">読み込み中…</p>
          ) : available.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              字幕はまだありません。投稿から数十秒後にできます。声のない動画には付きません。
            </p>
          ) : (
            <>
              <div className="mb-3 flex gap-1">
                {available.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      setLang(l.code);
                      setMessage(null);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      lang === l.code ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                誤認識や誤訳を直せます。時間と行数は変えられません。店名などの固有名詞を確認してください。
              </p>
              <ul className="space-y-2">
                {cues.map((c, i) => (
                  <li key={`${lang}-${i}`} className="flex items-start gap-2">
                    <span className="mt-2 w-9 shrink-0 text-[11px] tabular-nums text-slate-400">{formatTime(c.s)}</span>
                    <input
                      type="text"
                      value={draft[i] ?? c.t}
                      maxLength={120}
                      // 16px未満だとiPhoneで入力時に自動ズームされる。
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-base"
                      onChange={(e) =>
                        setDrafts((prev) => {
                          const list = [...(prev[lang] ?? cues.map((x) => x.t))];
                          list[i] = e.target.value;
                          return { ...prev, [lang]: list };
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {available.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3">
            {message && <p className="mb-2 text-xs text-slate-600">{message}</p>}
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={busy} onClick={removeAll} className="text-xs text-red-600 underline">
                字幕をすべて消す
              </button>
              <button
                type="button"
                disabled={busy || !changed || draft.some((t) => !t.trim())}
                onClick={save}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** リール一覧の各サムネイルに置く「字幕」ボタン。押すと編集モーダルが開く。 */
export function ReelCaptionEditButton({ reelId, className }: { reelId: string; className?: string }) {
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
        字幕
      </button>
      {open && <CaptionEditorModal reelId={reelId} onClose={() => setOpen(false)} />}
    </>
  );
}
