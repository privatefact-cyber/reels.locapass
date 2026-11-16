"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addShopChannel, removeShopChannel, setShopChannelStatus, syncShopChannelNow } from "./actions";

export type ChannelItem = {
  id: string;
  channelId: string;
  title: string | null;
  thumbUrl: string | null;
  status: "active" | "paused";
  lastCheckedAt: string | null;
  lastImportedAt: string | null;
  lastError: string | null;
  importedCount: number;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ";

/** チャンネルの登録・一時停止・削除・今すぐ確認。 */
export function ChannelManager({ shopId, channels, canUse }: { shopId: string; channels: ChannelItem[]; canUse: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setMessage(null);
    startTransition(async () => {
      const result = await addShopChannel(shopId, value);
      if (result.ok) {
        setValue("");
        setMessage({ kind: "ok", text: `「${result.title ?? "チャンネル"}」を登録しました。新しい動画を${result.imported}本、追加しました。` });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  function act(fn: () => Promise<unknown>, done?: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = (await fn()) as { ok?: boolean; message?: string } | undefined;
        if (r && typeof r === "object" && "message" in r && r.message) setMessage({ kind: r.ok ? "ok" : "error", text: r.message });
        else if (done) setMessage({ kind: "ok", text: done });
        router.refresh();
      } catch (e) {
        setMessage({ kind: "error", text: e instanceof Error ? e.message : "失敗しました" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-semibold text-slate-900" htmlFor="channel-input">YouTubeチャンネルを追加</label>
        <p className="mt-1 text-xs text-slate-500">
          お店のチャンネルのURL(例: https://www.youtube.com/@お店の名前)を貼ってください。「@名前」だけでも登録できます。
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="channel-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canUse || pending}
            placeholder="https://www.youtube.com/@..."
            // 16px未満だとiPhoneでタップ時に画面が拡大される。
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={add}
            disabled={!canUse || pending || !value.trim()}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pending ? "確認中…" : "登録する"}
          </button>
        </div>
        {message && (
          <p className={`mt-2 rounded-lg p-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
        )}
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-slate-500">まだチャンネルは登録されていません。</p>
      ) : (
        <ul className="space-y-3">
          {channels.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                {c.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`https://www.youtube.com/channel/${c.channelId}`} target="_blank" rel="noopener noreferrer" className="truncate text-base font-bold text-slate-900 underline">
                      {c.title ?? c.channelId}
                    </a>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.status === "active" ? "自動追加中" : "一時停止中"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    追加した動画 {c.importedCount}本 ・ 最後に確認 {fmt(c.lastCheckedAt)}
                    {c.lastImportedAt ? ` ・ 最後に追加 ${fmt(c.lastImportedAt)}` : ""}
                  </p>
                  {c.lastError && <p className="mt-1 text-xs text-red-600">前回の確認でエラー: {c.lastError}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={!canUse || pending} onClick={() => act(() => syncShopChannelNow(shopId, c.id))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">今すぐ確認</button>
                    <button type="button" disabled={!canUse || pending} onClick={() => act(() => setShopChannelStatus(shopId, c.id, c.status === "active" ? "paused" : "active"), c.status === "active" ? "一時停止しました" : "再開しました")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {c.status === "active" ? "一時停止" : "再開"}
                    </button>
                    <button
                      type="button"
                      disabled={!canUse || pending}
                      onClick={() => { if (confirm("このチャンネルの登録を外します。追加済みの動画は残ります。よろしいですか?")) act(() => removeShopChannel(shopId, c.id), "登録を外しました"); }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      登録を外す
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
