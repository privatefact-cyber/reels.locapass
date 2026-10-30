import { createHash } from "node:crypto";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 店舗・投稿者が入力した文章(紹介文・営業時間・料金・イベント等)の自動翻訳。サーバー専用。
 *
 * 入力は日本語に限らない。日本に住む外国人のお店が母国語(英語・中国語・韓国語など)で書いた文章も、
 * 原文の言語を自動で判定して、サイトの全表示言語(日・英・中・アラビア語)へ訳す。
 *
 * ページ全体を訳すGoogle翻訳ウィジェットではなく、保存時にGeminiで項目ごとに訳してDBに持つ。
 * - 店名・ビル名・キャスト名などの固有名詞を勝手に訳させない(ウィジェット方式だと崩れる)
 * - 表示のたびに翻訳APIを叩かない(閲覧数が増えても翻訳コストは増えない)
 * - 住所の英語化(lib/map/translateAddress.ts)と同じGEMINI_API_KEYで動き、追加の契約が要らない
 *
 * 保存形式: { source_hash, source_lang?, ja?, en?, zh?, ar? }
 * 原文は元の列にそのまま残し、原文と同じ言語のキーは持たない。source_lang が無い行は日本語原文(従来どおり)。
 */

export const TRANSLATION_TARGETS = ["ja", "en", "zh", "ar"] as const satisfies readonly Locale[];
export type TranslationTarget = (typeof TRANSLATION_TARGETS)[number];

/** DBに保存する翻訳。source_hash は翻訳元(原文)のハッシュで、変わっていなければ翻訳し直さない。 */
export type StoredTranslations = {
  source_hash?: string;
  /** 原文の言語(ISO 639-1)。無ければ日本語。サイトの表示言語以外(ko など)もありうる。 */
  source_lang?: string;
  ja?: Record<string, string>;
  en?: Record<string, string>;
  zh?: Record<string, string>;
  ar?: Record<string, string>;
  /**
   * 人が手直しした項目(言語 → キー)。手直しした訳が正で、原文が変わって訳し直すときも、この項目は上書きしない
   * (preserveManualTranslations)。例: { zh: ["description"] }
   */
  manual?: Partial<Record<TranslationTarget, string[]>>;
};

export type SourceFields = Record<string, string | null | undefined>;

function nonEmptyFields(fields: SourceFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value?.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

/** 翻訳元の原文から作るハッシュ。項目の順番に左右されないよう、キーで並べてから計算する。 */
export function translationSourceHash(fields: SourceFields): string {
  const entries = Object.entries(nonEmptyFields(fields)).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 32);
}

export function asStoredTranslations(value: unknown): StoredTranslations {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StoredTranslations) : {};
}

/** ひらがな・カタカナ(長音符を除く)。あれば日本語の文章と確定できる(中国語・韓国語には出ない)。 */
const KANA = /[ぁ-ゖァ-ヺㇰ-ㇿｦ-ﾝ]/;

/**
 * 文字種だけで原文が日本語と分かるか。分かれば "ja"、決め手が無ければ null(AIに判定させる)。
 * 仮名が1つも無い文章(英語・中国語・韓国語・漢字だけの日本語)がAI判定の対象になる。
 */
export function guessSourceLang(fields: SourceFields): "ja" | null {
  for (const value of Object.values(nonEmptyFields(fields))) {
    if (KANA.test(value)) return "ja";
  }
  return null;
}

/** 保存済みの原文言語。無ければ日本語(従来の保存形式)。 */
export function storedSourceLang(stored: unknown): string {
  return asStoredTranslations(stored).source_lang ?? "ja";
}

function targetsExcludingSource(targets: readonly TranslationTarget[], sourceLang: string): TranslationTarget[] {
  return targets.filter((t) => t !== sourceLang);
}

/** 今の原文に対して、保存済みの翻訳が古い(または無い)か。 */
export function needsTranslation(fields: SourceFields, stored: unknown, targets: readonly TranslationTarget[] = TRANSLATION_TARGETS): boolean {
  const st = asStoredTranslations(stored);
  if (st.source_hash !== translationSourceHash(fields)) return true;
  if (Object.keys(nonEmptyFields(fields)).length === 0) return false;
  // 原文の言語がまだ判定されていない行(従来の保存形式)で、仮名が無い文章は、日本語とは限らない。
  // 一度だけ判定し直す(判定後は source_lang が入るので、繰り返し引っかからない)。
  if (!st.source_lang && guessSourceLang(fields) !== "ja") return true;
  // 翻訳対象の言語が後から増えた場合、原文が変わっていなくても足りない言語を作る。
  return targetsExcludingSource(targets, storedSourceLang(st)).some((t) => !st[t]);
}

/**
 * 訳し直した結果に、人が手直しした項目を引き継ぐ。手直しした訳が正なので、自動翻訳で上書きしない。
 * 原文の言語が変わって、その言語が原文そのものになった場合や、項目がもう無い場合は、引き継がない。
 */
export function preserveManualTranslations(next: StoredTranslations | null, previous: unknown): StoredTranslations | null {
  if (!next) return next;
  const prev = asStoredTranslations(previous);
  if (!prev.manual) return next;
  const merged: StoredTranslations = { ...next };
  const manual: NonNullable<StoredTranslations["manual"]> = {};
  for (const lang of TRANSLATION_TARGETS) {
    const keys = prev.manual[lang];
    if (!keys?.length || lang === (next.source_lang ?? "ja")) continue;
    const kept: string[] = [];
    for (const key of keys) {
      const value = prev[lang]?.[key];
      if (!value) continue;
      merged[lang] = { ...merged[lang], [key]: value };
      kept.push(key);
    }
    if (kept.length) manual[lang] = kept;
  }
  if (Object.keys(manual).length) merged.manual = manual;
  return merged;
}

/** 保存済みの翻訳のうち、まだ無い言語だけを返す(その言語だけ作り足すバックフィル用)。 */
export function missingTargets(stored: unknown): TranslationTarget[] {
  const st = asStoredTranslations(stored);
  return targetsExcludingSource(TRANSLATION_TARGETS, storedSourceLang(st)).filter((t) => !st[t]);
}

/**
 * 表示する文字列を選ぶ。表示言語が原文と同じ、または翻訳が無い項目は原文のまま。
 * translated が true のときだけ「自動翻訳」の注記を出す。
 */
export function pickTranslation(
  locale: Locale,
  original: string | null,
  stored: unknown,
  key: string,
): { text: string | null; translated: boolean } {
  if (!original) return { text: original, translated: false };
  const st = asStoredTranslations(stored);
  if (locale === (st.source_lang ?? "ja")) return { text: original, translated: false };
  // アラビア語は、まだ翻訳が無い項目だけ英語の翻訳で代替する(英語も無ければ原文)。
  const translated = locale === "ar" ? (st.ar?.[key] ?? st.en?.[key]) : st[locale]?.[key];
  if (!translated) return { text: original, translated: false };
  // 人が手直しした訳には、「自動翻訳」の注記を出さない。
  const edited = st.manual?.[locale === "ar" && !st.ar?.[key] ? "en" : locale]?.includes(key) === true;
  return { text: translated, translated: !edited };
}

const TARGET_LABEL: Record<TranslationTarget, string> = {
  ja: "natural Japanese (key \"ja\")",
  en: "natural English (key \"en\")",
  zh: "Simplified Chinese (key \"zh\")",
  ar: "Modern Standard Arabic (key \"ar\")",
};

function buildPromptRules(targets: readonly TranslationTarget[], detect: boolean): string {
  const langList = targets.map((t) => TARGET_LABEL[t]).join(", ");
  const shape = [...(detect ? ['"src": "<source language code>"'] : []), ...targets.map((t) => `"${t}": {<same keys>}`)].join(", ");
  return [
    "You translate text written by shops, restaurants and nightlife venues in Japan for their listing pages.",
    "The owner may be Japanese or a foreigner living in Japan, so the text can be in any language (Japanese, English, Chinese, Korean, Vietnamese, etc.).",
    `Translate every field of every item into ${langList}.`,
    ...(detect
      ? [
          "First decide the language the item is mainly written in and return its ISO 639-1 code as \"src\" (ja, en, zh, ko, vi, ...).",
          "If a requested target is the same language as the source, return the original text of that field unchanged for that target.",
          "A single field that is already in a target language is also returned unchanged for that target.",
        ]
      : []),
    "Rules:",
    "- Do not translate proper nouns: the shop's own name, building names and people's names.",
    "  In English write Japanese names in romaji (or keep the Latin spelling if they already use it); in Chinese keep them as written;",
    "  in Arabic write them in Latin letters (romaji, or the existing Latin spelling), because Arabic readers cannot read Japanese script.",
    "  In Japanese, write foreign people's names in katakana; keep Latin brand and shop names as they are.",
    "- Product brand and model names that are written in Japanese katakana (car makes such as ポルシェ, フェラーリ, ランボルギーニ, プジョー) must not be left in Japanese when the target is not Japanese:",
    "  write the standard international form (Porsche, Ferrari, Lamborghini, Peugeot) in English, the standard Chinese names (保时捷, 法拉利, 兰博基尼, 标致) in Chinese, and the standard Arabic names (بورشه, فيراري, لامبورغيني, بيجو) in Arabic.",
    "  Keep model codes and numbers as they are (911, GT3, Type996, E-208).",
    "- Keep every number, time and price exactly (use Western digits 0-9 in Arabic too).",
    "  Write 翌5:00 as \"until 5:00 AM (next day)\" / \"至次日5:00\" / \"حتى الساعة 5:00 صباحًا (اليوم التالي)\".",
    "- Currency: 円 / yen / 日元 / JPY become \"yen\" in English, \"日元\" in Chinese, \"ين\" in Arabic and \"円\" in Japanese. 年中無休 means open every day.",
    "- Do not add, remove or soften information. Keep line breaks.",
    "- Translate into the natural wording a native speaker of the target language would use, not word for word.",
    "- Short, friendly, listing-page tone. No marketing exaggeration that is not in the original.",
    "Return ONLY JSON: an array with one object per input item, in the same order,",
    `each shaped as {${shape}}.`,
  ].join("\n");
}

async function callGemini(items: Record<string, string>[], targets: readonly TranslationTarget[], detect: boolean): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  // 主モデルが混雑(503)のときは、再試行と予備モデルへの切り替えで乗り切る。
  const res = await geminiGenerateWithFallback(
    apiKey,
    {
      contents: [{ parts: [{ text: `${buildPromptRules(targets, detect)}\n\n${JSON.stringify(items)}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    },
    "content translation",
    50_000, // 複数言語ぶんの長めの文章を訳すので、画像つきの生成より長く待つ
  );
  if (!res) throw new Error("翻訳APIエラー: すべてのモデルで失敗しました");

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
}

/** AIが返した言語コードを、保存する形(小文字2〜3字)に整える。読めなければ null。 */
function normalizeLangCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

/**
 * 同じ条件(仮名で日本語と分かっているか)の項目をまとめて1回で訳す。
 * 応答の件数・キーが入力と食い違った項目は null。
 */
async function translateGroup(
  items: SourceFields[],
  cleaned: Record<string, string>[],
  targets: readonly TranslationTarget[],
  knownSource: "ja" | null,
): Promise<(StoredTranslations | null)[]> {
  const requestTargets = knownSource ? targetsExcludingSource(targets, knownSource) : [...targets];
  if (requestTargets.length === 0) {
    return items.map((fields) => ({ source_hash: translationSourceHash(fields), ...(knownSource ? { source_lang: knownSource } : {}) }));
  }

  const parsed = await callGemini(cleaned, requestTargets, !knownSource);
  if (!Array.isArray(parsed) || parsed.length !== cleaned.length) return items.map(() => null);

  return items.map((fields, index) => {
    const keys = Object.keys(cleaned[index]);
    const response = parsed[index] as ({ src?: unknown } & Partial<Record<TranslationTarget, Record<string, unknown>>>) | null;
    const sourceLang = knownSource ?? normalizeLangCode(response?.src);
    if (!sourceLang) return null;

    const stored: StoredTranslations = { source_hash: translationSourceHash(fields), source_lang: sourceLang };
    for (const target of targetsExcludingSource(targets, sourceLang)) {
      const values = response?.[target];
      const picked: Record<string, string> = {};
      for (const key of keys) {
        const v = values?.[key];
        if (typeof v === "string" && v.trim()) picked[key] = v.trim();
      }
      if (Object.keys(picked).length !== keys.length) return null;
      stored[target] = picked;
    }
    return stored;
  });
}

/**
 * 複数の項目セットをまとめて翻訳する(最大2回のAPI呼び出し)。
 * 空の項目しか無いセットはAPIに送らず、source_hashだけ持たせる。
 * 応答の件数・キーが入力と食い違ったセットは null(呼び出し側は原文表示のままにする)。
 */
export async function translateFieldsBatch(
  items: SourceFields[],
  targets: readonly TranslationTarget[] = TRANSLATION_TARGETS,
): Promise<(StoredTranslations | null)[]> {
  const cleaned = items.map(nonEmptyFields);

  const results: (StoredTranslations | null)[] = items.map((fields) => ({
    source_hash: translationSourceHash(fields),
  }));

  const japaneseIdx: number[] = [];
  const unknownIdx: number[] = [];
  cleaned.forEach((c, i) => {
    if (Object.keys(c).length === 0) return;
    (guessSourceLang(items[i]) === "ja" ? japaneseIdx : unknownIdx).push(i);
  });

  for (const [indexes, knownSource] of [
    [japaneseIdx, "ja"],
    [unknownIdx, null],
  ] as const) {
    if (indexes.length === 0) continue;
    const group = await translateGroup(
      indexes.map((i) => items[i]),
      indexes.map((i) => cleaned[i]),
      targets,
      knownSource,
    );
    indexes.forEach((itemIndex, n) => {
      results[itemIndex] = group[n];
    });
  }

  return results;
}

export async function translateFields(fields: SourceFields): Promise<StoredTranslations | null> {
  const [result] = await translateFieldsBatch([fields]);
  return result ?? null;
}
