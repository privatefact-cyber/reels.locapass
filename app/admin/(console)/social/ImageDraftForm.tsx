"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Action = (kind: "shop" | "ai", dest: string, audience: string, note: string) => Promise<{ ok: boolean; message: string }>;

/** 投稿先を選んで、写真つきの下書きを自動で作る。AIが作る間は「考え中…○秒」を出す。 */
export function ImageDraftForm({ action, videoAction }: { action: Action; videoAction: (dest: string) => Promise<{ ok: boolean; message: string }> }) {
  const [dest, setDest] = useState("instagram:locapass");
  const [audience, setAudience] = useState("public");
  const [note, setNote] = useState("");
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const runVideo = () => start(async () => {
    setNotice(null);
    try { setNotice(await videoAction(dest)); } catch { setNotice({ ok: false, message: "通信に失敗しました。ページを開き直して確認してください" }); }
    router.refresh();
  });
  const run = (kind: "shop" | "ai") => start(async () => {
    setNotice(null);
    try { setNotice(await action(kind, dest, audience, note)); } catch { setNotice({ ok: false, message: "通信に失敗しました。ページを開き直して確認してください" }); }
    router.refresh();
  });
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!pending) return;
    setSeconds(0);
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [pending]);
  const btn = "rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60";
  return (
    <div className="space-y-2">
      <select value={dest} onChange={(e) => setDest(e.target.value)} disabled={pending} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
        <option value="instagram:locapass">Instagram LOCAPASS</option>
        <option value="instagram:luxela">Instagram LUXELA</option>
        <option value="threads:locapass">Threads LOCAPASS</option>
        <option value="threads:luxela">Threads LUXELA</option>
      </select>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        AIが書く文章の読者
        <select value={audience} onChange={(e) => setAudience(e.target.value)} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
          <option value="public">一般(ユーザー)向け</option>
          <option value="shop">店舗向け</option>
          <option value="auto">おまかせ(交互)</option>
        </select>
        <span className="text-slate-400">※「AIの画像と文章」のときだけ使います</span>
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={pending} placeholder="今回だけの一言(任意)例: 雨の日の話にして / もっと短く" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => run("shop")} className={`${btn} bg-slate-900 text-white`}>掲載店舗の写真で下書きを作る</button>
        <button type="button" disabled={pending} onClick={() => run("ai")} className={`${btn} border border-slate-300 bg-white text-slate-800`}>AIの画像と文章で下書きを作る</button>
        <button type="button" disabled={pending} onClick={runVideo} className={`${btn} border border-violet-300 bg-violet-50 text-violet-900`}>🎬 店舗の動画(リール)で下書きを作る</button>
        {pending && <span role="status" className="text-sm font-semibold text-amber-700">考え中…{seconds}秒(最大1分ほど)</span>}
      </div>
      {notice && <p role="status" className={`text-sm font-semibold ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>{notice.message}</p>}
    </div>
  );
}
