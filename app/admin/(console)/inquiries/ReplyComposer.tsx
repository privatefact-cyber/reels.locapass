"use client";

import { useState } from "react";

type Action = (formData: FormData) => void | Promise<void>;

/**
 * 返信・対応内容を書いて、送る/記録する。
 *  - メールで送信: 宛先がメールアドレスで、メール送信が設定されているとき。送れたら履歴に残り「返信済み」になる。
 *  - メールアプリで開く: 宛先がメールアドレスのとき。いつものメールソフトで送る(送ったあとは「返信済みとして記録」を押す)。
 *  - 返信済みとして記録: 電話など、この画面の外で返信したときに、内容を履歴に残して「返信済み」にする。
 */
export function ReplyComposer({
  email,
  mailConfigured,
  defaultSubject,
  sendEmail,
  record,
}: {
  email: string | null;
  mailConfigured: boolean;
  defaultSubject: string;
  sendEmail: Action;
  record: Action;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const mailto = email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;

  return (
    <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">返信する</h2>
      {email ? (
        <label className="block text-xs font-semibold text-slate-600">
          件名
          <input
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
          />
        </label>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">連絡先がメールアドレスではないため(電話番号など)、メールでは送れません。電話などで返信したら、内容を記録してください。</p>
      )}
      <label className="block text-xs font-semibold text-slate-600">
        {email ? "返信の内容" : "対応した内容"}
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={5000}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {email && mailConfigured && (
          <button formAction={sendEmail} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            メールで送信
          </button>
        )}
        {mailto && (
          <a href={mailto} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            メールアプリで開く
          </a>
        )}
        <button formAction={record} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          返信済みとして記録
        </button>
      </div>
      {email && !mailConfigured && (
        <p className="text-xs text-slate-500">この画面からのメール送信は、まだ設定されていません。いまは「メールアプリで開く」で送って、そのあと「返信済みとして記録」を押してください。</p>
      )}
    </form>
  );
}
