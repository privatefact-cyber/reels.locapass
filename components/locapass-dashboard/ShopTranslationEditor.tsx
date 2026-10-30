"use client";

import { useState, useTransition } from "react";
import { saveShopTranslationEdits } from "@/app/dashboard/shop/[shopId]/actions";
import { LOCALE_LABEL, type Locale } from "@/lib/i18n/locale";

export type TranslationEditorField = { key: string; label: string; original: string };
type Stored = Partial<Record<Locale, Record<string, string>>> & { manual?: Partial<Record<Locale, string[]>> };

/**
 * 自動翻訳された文を確認して、直接書き直せる欄。直した訳が正になり、あとで原文を変えても上書きされない。
 * 原文と同じ言語の欄は出さない(原文は上の店舗情報で編集する)。
 */
export function ShopTranslationEditor({
  shopId,
  fields,
  languages,
  stored,
}: {
  shopId: string;
  fields: TranslationEditorField[];
  languages: Locale[];
  stored: Stored;
}) {
  const [lang, setLang] = useState<Locale>(languages[0]);
  const [drafts, setDrafts] = useState<Partial<Record<Locale, Record<string, string>>>>({});
  const [saved, setSaved] = useState<Stored>(stored);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = (key: string) => drafts[lang]?.[key] ?? saved[lang]?.[key] ?? "";
  const isManual = (key: string) => saved.manual?.[lang]?.includes(key) === true;
  const dirtyKeys = fields.filter((f) => (drafts[lang]?.[f.key] ?? null) !== null && drafts[lang]![f.key].trim() !== (saved[lang]?.[f.key] ?? ""));

  function save() {
    const edits = Object.fromEntries(dirtyKeys.map((f) => [f.key, drafts[lang]![f.key]]));
    setMessage(null);
    startTransition(async () => {
      try {
        await saveShopTranslationEdits(shopId, lang, edits);
        setSaved((prev) => ({
          ...prev,
          [lang]: { ...(prev[lang] ?? {}), ...Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, v.trim()])) },
          manual: { ...(prev.manual ?? {}), [lang]: [...new Set([...(prev.manual?.[lang] ?? []), ...Object.keys(edits)])] },
        }));
        setDrafts((prev) => ({ ...prev, [lang]: {} }));
        setMessage("保存しました");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {languages.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === lang}
            onClick={() => {
              setLang(l);
              setMessage(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${l === lang ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>

      {fields.map((f) => (
        <div key={f.key}>
          <div className="flex items-center gap-2">
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`tr-${lang}-${f.key}`}>
              {f.label}
            </label>
            {isManual(f.key) && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">手直し済み</span>}
          </div>
          <textarea
            id={`tr-${lang}-${f.key}`}
            dir={lang === "ar" ? "rtl" : "ltr"}
            rows={3}
            value={current(f.key)}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [f.key]: e.target.value } }))}
            // 16px未満だとiPhoneで入力時に自動ズームされる。
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400" data-no-translate>
            {f.original}
          </p>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || dirtyKeys.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "保存中…" : "この言語の訳を保存"}
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </div>
  );
}
