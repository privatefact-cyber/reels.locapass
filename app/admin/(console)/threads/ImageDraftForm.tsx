"use client";

import { useEffect, useState, useTransition } from "react";

type Action = (kind: "shop" | "ai", dest: string, audience: string) => Promise<void>;

/** 投稿先を選んで、写真つきの下書きを自動で作る。AIが作る間は「考え中…○秒」を出す。 */
export function ImageDraftForm({ action }: { action: Action }) {
  const [dest, setDest] = useState("instagram:locapass");
  const [audience, setAudience] = useState("public");
  const [pending, start] = useTransition();
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => { await action("shop", dest, audience); })} className={`${btn} bg-slate-900 text-white`}>掲載店舗の写真で下書きを作る</button>
        <button type="button" disabled={pending} onClick={() => start(async () => { await action("ai", dest, audience); })} className={`${btn} border border-slate-300 bg-white text-slate-800`}>AIの画像と文章で下書きを作る</button>
        {pending && <span role="status" className="text-sm font-semibold text-amber-700">考え中…{seconds}秒(最大1分ほど)</span>}
      </div>
    </div>
  );
}
