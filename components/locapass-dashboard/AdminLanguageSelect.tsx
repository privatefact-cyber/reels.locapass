"use client";

import { useRouter } from "next/navigation";
import { ADMIN_LOCALE_COOKIE, LANGUAGES } from "@/lib/i18n/languages";

/**
 * 管理画面の表示言語の選択。公開サイトの言語(ヘッダーの切替)とは別。
 * 言語名は、それぞれの言語で書く(自分の言語を探せるように。翻訳しない)。
 */
export function AdminLanguageSelect({ current }: { current: string }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300" data-no-translate>
      <span aria-hidden>🌐</span>
      <select
        value={current}
        aria-label="Language"
        onChange={(e) => {
          document.cookie = `${ADMIN_LOCALE_COOKIE}=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          router.refresh();
        }}
        // 16px未満だとiPhoneで操作時に自動ズームされる。
        className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-base text-slate-100"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
