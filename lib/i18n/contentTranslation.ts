import { createHash } from "node:crypto";
import { geminiGenerateContentUrl } from "@/lib/gemini";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 店舗が日本語で入力した文章(紹介文・営業時間・料金・イベント等)の自動翻訳。サーバー専用。
 *
 * ページ全体を訳すGoogle翻訳ウィジェットではなく、保存時にGeminiで項目ごとに訳してDBに持つ。
 * - 店名・ビル名・キャスト名などの固有名詞を勝手に訳させない(ウィジェット方式だと崩れる)
 * - 表示のたびに翻訳APIを叩かない(閲覧数が増えても翻訳コストは増えない)
 * - 住所の英語化(lib/map/translateAddress.ts)と同じGEMINI_API_KEYで動き、追加の契約が要らない
 */

export const TRANSLATION_TARGETS = ["en", "zh"] as const;
export type TranslationTarget = (typeof TRANSLATION_TARGETS)[number];

/** DBに保存する翻訳。source_hash は翻訳元(日本語)のハッシュで、変わっていなければ翻訳し直さない。 */
export type StoredTranslations = {
  source_hash?: string;
  en?: Record<string, string>;
  zh?: Record<string, string>;
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

/** 翻訳元の日本語から作るハッシュ。項目の順番に左右されないよう、キーで並べてから計算する。 */
export function translationSourceHash(fields: SourceFields): string {
  const entries = Object.entries(nonEmptyFields(fields)).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 32);
}

export function asStoredTranslations(value: unknown): StoredTranslations {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StoredTranslations) : {};
}

/** 今の日本語に対して、保存済みの翻訳が古い(または無い)か。 */
export function needsTranslation(fields: SourceFields, stored: unknown): boolean {
  return asStoredTranslations(stored).source_hash !== translationSourceHash(fields);
}

/**
 * 表示する文字列を選ぶ。日本語表示、または翻訳が無い項目は原文のまま。
 * translated が true のときだけ「自動翻訳」の注記を出す。
 */
export function pickTranslation(
  locale: Locale,
  original: string | null,
  stored: unknown,
  key: string,
): { text: string | null; translated: boolean } {
  if (locale === "ja" || !original) return { text: original, translated: false };
  // アラビア語の保存翻訳はまだ作っていないので、英語の翻訳があればそれで代替し、無ければ原文を出す。
  const stored2 = asStoredTranslations(stored);
  const translated = locale === "ar" ? stored2.en?.[key] : stored2[locale]?.[key];
  return translated ? { text: translated, translated: true } : { text: original, translated: false };
}

const PROMPT_RULES = [
  "You translate Japanese text written by nightlife venues and restaurants in Japan for their listing pages.",
  "Translate every field of every item into natural English (key \"en\") and Simplified Chinese (key \"zh\").",
  "Rules:",
  "- Do not translate proper nouns: shop names, building names, brand names and people's names.",
  "  In English write them in romaji (or keep the Latin spelling if they already use it); in Chinese keep them as written.",
  "- Keep every number, time and price exactly. Write 翌5:00 as \"until 5:00 AM (next day)\" / \"至次日5:00\".",
  "- 円 becomes \"yen\" in English and \"日元\" in Chinese. 年中無休 means open every day.",
  "- Do not add, remove or soften information. Keep line breaks.",
  "- Short, friendly, listing-page tone. No marketing exaggeration that is not in the original.",
  "Return ONLY JSON: an array with one object per input item, in the same order,",
  "each shaped as {\"en\": {<same keys>}, \"zh\": {<same keys>}}.",
].join("\n");

async function callGemini(items: Record<string, string>[]): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const res = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT_RULES}\n\n${JSON.stringify(items)}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`翻訳APIエラー: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
}

/**
 * 複数の項目セットをまとめて翻訳する(1回のAPI呼び出し)。
 * 空の項目しか無いセットはAPIに送らず、source_hashだけ持たせる。
 * 応答の件数・キーが入力と食い違ったセットは null(呼び出し側は日本語表示のままにする)。
 */
export async function translateFieldsBatch(items: SourceFields[]): Promise<(StoredTranslations | null)[]> {
  const cleaned = items.map(nonEmptyFields);
  const toSendIndexes = cleaned.map((c, i) => (Object.keys(c).length ? i : -1)).filter((i) => i >= 0);

  const results: (StoredTranslations | null)[] = items.map((fields) => ({
    source_hash: translationSourceHash(fields),
  }));
  if (toSendIndexes.length === 0) return results;

  const parsed = await callGemini(toSendIndexes.map((i) => cleaned[i]));
  if (!Array.isArray(parsed) || parsed.length !== toSendIndexes.length) {
    for (const i of toSendIndexes) results[i] = null;
    return results;
  }

  toSendIndexes.forEach((itemIndex, responseIndex) => {
    const keys = Object.keys(cleaned[itemIndex]);
    const response = parsed[responseIndex] as Partial<Record<TranslationTarget, Record<string, unknown>>> | null;
    const stored: StoredTranslations = { source_hash: translationSourceHash(items[itemIndex]) };
    for (const target of TRANSLATION_TARGETS) {
      const values = response?.[target];
      const picked: Record<string, string> = {};
      for (const key of keys) {
        const v = values?.[key];
        if (typeof v === "string" && v.trim()) picked[key] = v.trim();
      }
      if (Object.keys(picked).length !== keys.length) {
        results[itemIndex] = null;
        return;
      }
      stored[target] = picked;
    }
    results[itemIndex] = stored;
  });

  return results;
}

export async function translateFields(fields: SourceFields): Promise<StoredTranslations | null> {
  const [result] = await translateFieldsBatch([fields]);
  return result ?? null;
}
