"use client";

import { useState, useTransition } from "react";

/** 6桁PINの発行UI。平文は発行直後の1回しか表示できない(再表示不可、忘れたら再発行)。 */
export function LoginPinPanel({
  hasPin,
  issue,
}: {
  hasPin: boolean;
  issue: () => Promise<{ pin?: string; error?: string }>;
}) {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (hasPin || pin) {
      if (!window.confirm("暗証番号を再発行します。今までの暗証番号は使えなくなります。よろしいですか？")) return;
    }
    startTransition(async () => {
      const res = await issue();
      if (res.pin) {
        setPin(res.pin);
        setError(null);
      } else {
        setError(res.error ?? "発行に失敗しました");
      }
    });
  }

  return (
    <div className="rounded border border-black/10 bg-black/[0.03] p-3">
      <p className="text-xs font-semibold text-black/70">ログイン用の暗証番号(6桁)</p>
      {pin ? (
        <>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.4em]">{pin}</p>
          <p className="mt-1 text-[11px] text-red-600">
            この画面を閉じると二度と表示できません。リンクとは別の方法(口頭など)で本人に伝えてください。
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-black/50">
          {hasPin
            ? "発行済みです(セキュリティのため再表示できません。忘れた場合は再発行してください)。"
            : "未発行です。発行するまでこのリンクではログインできません。"}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="mt-2 rounded bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {pending ? "発行中..." : hasPin || pin ? "暗証番号を再発行" : "暗証番号を発行"}
      </button>
    </div>
  );
}
