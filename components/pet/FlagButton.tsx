"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { flagPetReport } from "@/app/pet/actions";

const REASONS_BY_TYPE = {
  lost: ["いたずら・うその情報", "同じ内容が重複している", "個人情報がのっている", "もう解決している", "その他"],
  found: ["いたずら・うその情報", "同じ内容が重複している", "個人情報がのっている", "もう解決している", "その他"],
  diary: ["犬が写っていない", "住所・表札などが写っている", "不快な写真", "他人の写真の無断使用", "その他"],
};

/** 迷子のお知らせ・見つけました通報の「不適切を報告」(運営が管理画面で確認) */
export function FlagButton({ targetType, targetId, loggedIn }: { targetType: "lost" | "found" | "diary"; targetId: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <p className="text-center text-xs text-[#9C8273]">報告ありがとうございました。運営が確認します。</p>;

  return (
    <div className="text-center">
      {!open ? (
        <button
          type="button"
          onClick={() => (loggedIn ? setOpen(true) : (location.href = `/pet/login?redirect=${encodeURIComponent(location.pathname + location.search)}`))}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#C9B3A3]"
        >
          <Flag size={12} />
          不適切を報告
        </button>
      ) : (
        <div className="rounded-2xl bg-white p-3 text-left shadow-sm">
          <p className="mb-2 text-xs font-extrabold text-[#7A6050]">報告の理由</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS_BY_TYPE[targetType].map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await flagPetReport(targetType, targetId, r);
                  setBusy(false);
                  if (res.ok) setDone(true);
                  else setError(res.error);
                }}
                className="rounded-full border border-[#F1E1CF] px-3 py-1.5 text-xs font-bold text-[#7A6050] active:bg-[#FFEBDD]"
              >
                {r}
              </button>
            ))}
          </div>
          {busy && <Loader2 size={14} className="mt-2 animate-spin text-[#B39C8C]" />}
          {error && <p className="mt-2 text-xs font-bold text-[#D04848]">{error}</p>}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 text-xs text-[#B39C8C]">
            やめる
          </button>
        </div>
      )}
    </div>
  );
}
