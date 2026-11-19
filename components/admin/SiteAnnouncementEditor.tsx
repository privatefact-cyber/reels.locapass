"use client";

import { useState, useTransition } from "react";
import { setSiteAnnouncement } from "@/app/admin/(console)/portals/actions";

/** トップに出す「サイトのお知らせ」を書き込み・編集・削除する運営専用フォーム。本文を空にして保存すると非表示になる。 */
export function SiteAnnouncementEditor({ initialText, initialUrl }: { initialText: string; initialUrl: string }) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const [saved, setSaved] = useState({ text: initialText, url: initialUrl });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = text !== saved.text || url !== saved.url;
  const visible = saved.text.trim() !== "";

  function run(nextText: string, nextUrl: string, done: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await setSiteAnnouncement(nextText, nextUrl);
        const t = nextText.trim();
        const u = t ? nextUrl.trim() : "";
        setText(t);
        setUrl(u);
        setSaved({ text: t, url: u });
        setMessage({ ok: true, text: t ? done : "お知らせを削除しました(トップには何も表示されません)" });
      } catch (e) {
        setMessage({ ok: false, text: e instanceof Error ? e.message : "保存に失敗しました" });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-700" htmlFor="announcement-text">本文(500文字まで・改行できます)</label>
        <textarea
          id="announcement-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="例: 12/24〜12/25はクリスマス特集をお届けします"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
        />
        <p className="mt-0.5 text-right text-[11px] text-slate-400">{text.length}/500</p>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-700" htmlFor="announcement-url">リンク先(任意。https://… か /events のようなサイト内パス)</label>
        <input
          id="announcement-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/news"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(text, url, visible ? "お知らせを更新しました" : "お知らせを公開しました")}
          disabled={pending || !dirty}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {pending ? "保存中..." : visible ? "更新する" : "公開する"}
        </button>
        {visible && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("お知らせを削除して、トップの表示を消します。よろしいですか?")) run("", "", "");
            }}
            disabled={pending}
            className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            削除する
          </button>
        )}
        <span className="text-[11px] text-slate-500">{visible ? "いまトップに表示中" : "いまは非表示(本文が空)"}</span>
      </div>
      {message && <p className={`text-[11px] font-semibold ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}
    </div>
  );
}
