"use client";

import { useState, useTransition } from "react";
import { saveRowTranslationEdits, saveShopTranslationEdits, type RowTranslationKind } from "@/app/dashboard/shop/[shopId]/actions";
import { LOCALE_LABEL, type Locale } from "@/lib/i18n/locale";

export type TranslationEditorField = { key: string; label: string; original: string };
export type TranslationStored = Partial<Record<Locale, Record<string, string>>> & { source_lang?: string; manual?: Partial<Record<Locale, string[]>> };
/** 手直しする文章のまとまり。店舗情報なら1つ、メニュー・イベント・リール投稿文は1件ごとに1つ。 */
export type TranslationEditorGroup = {
  /** 画面内で重ならない識別子(店舗情報は "shop"、そのほかは "種類:行ID")。 */
  id: string;
  kind: "shop" | RowTranslationKind;
  rowId?: string;
  /** 見出し(「メニュー」「イベント」など)。 */
  heading: string;
  fields: TranslationEditorField[];
  stored: TranslationStored;
};

/**
 * 自動翻訳された文を確認して、直接書き直せる欄。直した訳が正になり、あとで原文を変えても上書きされない。
 * 原文と同じ言語の欄は出さない(原文は上の入力欄で編集する)。
 */
export function ShopTranslationEditor({ shopId, groups, languages }: { shopId: string; groups: TranslationEditorGroup[]; languages: Locale[] }) {
  const [lang, setLang] = useState<Locale>(languages[0]);
  const [drafts, setDrafts] = useState<Partial<Record<Locale, Record<string, string>>>>({});
  const [saved, setSaved] = useState<Record<string, TranslationStored>>(() => Object.fromEntries(groups.map((g) => [g.id, g.stored])));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const draftKey = (g: TranslationEditorGroup, key: string) => `${g.id}|${key}`;
  const current = (g: TranslationEditorGroup, key: string) => drafts[lang]?.[draftKey(g, key)] ?? saved[g.id]?.[lang]?.[key] ?? "";
  const isManual = (g: TranslationEditorGroup, key: string) => saved[g.id]?.manual?.[lang]?.includes(key) === true;
  // この言語で出す(原文と同じ言語は出さない)まとまり。
  const visibleGroups = groups.filter((g) => (g.stored.source_lang ?? "ja") !== lang && !!saved[g.id]?.[lang]);
  const dirty = (g: TranslationEditorGroup) =>
    g.fields.filter((f) => {
      const d = drafts[lang]?.[draftKey(g, f.key)];
      return d !== undefined && d.trim() !== "" && d.trim() !== (saved[g.id]?.[lang]?.[f.key] ?? "");
    });
  const dirtyCount = visibleGroups.reduce((n, g) => n + dirty(g).length, 0);

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        for (const g of visibleGroups) {
          const fieldsToSave = dirty(g);
          if (fieldsToSave.length === 0) continue;
          const edits = Object.fromEntries(fieldsToSave.map((f) => [f.key, drafts[lang]![draftKey(g, f.key)]]));
          if (g.kind === "shop") await saveShopTranslationEdits(shopId, lang, edits);
          else await saveRowTranslationEdits(shopId, g.kind, g.rowId!, lang, edits);
          setSaved((prev) => {
            const before = prev[g.id] ?? {};
            return {
              ...prev,
              [g.id]: {
                ...before,
                [lang]: { ...(before[lang] ?? {}), ...Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, v.trim()])) },
                manual: { ...(before.manual ?? {}), [lang]: [...new Set([...(before.manual?.[lang] ?? []), ...Object.keys(edits)])] },
              },
            };
          });
        }
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

      {visibleGroups.length === 0 && <p className="text-xs text-slate-500">この言語に直せる訳はまだありません。</p>}

      {visibleGroups.map((g, gi) => (
        <div key={g.id} className={gi > 0 ? "space-y-3 border-t border-slate-100 pt-4" : "space-y-3"}>
          {g.kind !== "shop" && (
            <p className="text-[11px] font-semibold text-slate-400" data-no-translate>
              {g.heading}
            </p>
          )}
          {g.fields.map((f) => {
            const id = `tr-${lang}-${g.id}-${f.key}`;
            return (
              <div key={f.key}>
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-semibold text-slate-500" htmlFor={id}>
                    {f.label}
                  </label>
                  {isManual(g, f.key) && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">手直し済み</span>}
                </div>
                <textarea
                  id={id}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  rows={g.kind === "price" ? 1 : 3}
                  value={current(g, f.key)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [draftKey(g, f.key)]: e.target.value } }))}
                  // 16px未満だとiPhoneで入力時に自動ズームされる。
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400" data-no-translate>
                  {f.original}
                </p>
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || dirtyCount === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "保存中…" : "この言語の訳を保存"}
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </div>
  );
}
