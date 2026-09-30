/**
 * 字幕の翻訳と、焼き込み字幕の位置判定(Gemini Flash-Lite)。サーバー専用。
 * 費用は翻訳1本あたり約0.05〜0.1円(2言語)。GEMINI_API_KEY は他機能と共通。
 */
import { geminiLiteGenerateContentUrl } from "@/lib/gemini";
import type { Cue } from "./transcribe";

export type CaptionLang = "ja" | "en" | "zh";
export const CAPTION_LANGS: CaptionLang[] = ["ja", "en", "zh"];
export type AvoidZone = "none" | "top" | "middle" | "bottom";

const LANG_LABEL: Record<CaptionLang, string> = {
  ja: "natural Japanese",
  en: "natural English",
  zh: "Simplified Chinese",
};

/** Whisperが返す言語名 → 字幕の言語コード(3言語以外はnull)。 */
export function sourceLangCode(whisperLanguage: string): CaptionLang | null {
  if (whisperLanguage.startsWith("japan")) return "ja";
  if (whisperLanguage.startsWith("english")) return "en";
  if (whisperLanguage.startsWith("chinese")) return "zh";
  return null;
}

async function callGemini(parts: unknown[], maxOutputTokens: number): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const res = await fetch(geminiLiteGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
}

/**
 * cues を targets の各言語へ翻訳する。戻り値は言語ごとのcue配列(時刻は元のまま)。
 * 件数が合わない言語は返さない(時刻ずれを起こすより、その言語は出さない方がよい)。
 */
export async function translateCues(
  cues: Cue[],
  targets: CaptionLang[],
  hint: { shopName?: string | null },
): Promise<Partial<Record<CaptionLang, Cue[]>>> {
  if (cues.length === 0 || targets.length === 0) return {};

  const shape = targets.map((t) => `"${t}": [...]`).join(", ");
  const prompt = [
    "You translate short spoken lines from a promotional video of a shop or restaurant in Japan into subtitles.",
    `Translate every line into: ${targets.map((t) => `${LANG_LABEL[t]} (key "${t}")`).join(", ")}.`,
    "Rules:",
    "- Return ONLY JSON: {" + shape + "}. Each value is an array of strings with EXACTLY the same number of items, in the same order, as the input lines.",
    "- Keep every line short and natural for on-screen subtitles. Do not merge or split lines.",
    "- Do not translate proper nouns (shop names, brand names, people's names); in English write Japanese names in romaji.",
    "- Keep numbers, times and prices exactly. 円 is \"yen\" in English, \"日元\" in Chinese.",
    "- Do not add information that is not in the line.",
    hint.shopName ? `Shop name (keep as is): ${hint.shopName}` : "",
    "",
    "Input lines (JSON array):",
    JSON.stringify(cues.map((c) => c.t)),
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = (await callGemini([{ text: prompt }], 4096)) as Record<string, unknown>;
  const out: Partial<Record<CaptionLang, Cue[]>> = {};
  for (const lang of targets) {
    const lines = parsed?.[lang];
    if (!Array.isArray(lines) || lines.length !== cues.length) continue;
    if (!lines.every((l) => typeof l === "string" && l.trim())) continue;
    out[lang] = cues.map((c, i) => ({ s: c.s, e: c.e, t: (lines[i] as string).trim() }));
  }
  return out;
}

/**
 * サムネイル(1フレーム)に、焼き込み字幕/テロップが入っていればその位置を返す。
 * 判定できない・画像が取れないときは "none"(投稿を止めない)。
 */
export async function detectBurnedInZone(posterUrl: string | null): Promise<AvoidZone> {
  if (!posterUrl) return "none";
  try {
    const res = await fetch(posterUrl);
    if (!res.ok) return "none";
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 3 * 1024 * 1024) return "none";
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const data = Buffer.from(buf).toString("base64");

    const parsed = (await callGemini(
      [
        {
          text:
            "This is one frame of a vertical short video. Are there burned-in subtitles or large text overlays (telop) on the frame? " +
            'Answer ONLY JSON: {"zone":"none"|"top"|"middle"|"bottom"} where zone is the vertical area holding the overlaid text ("none" if there is no overlaid text; ignore text that is part of the scene, like shop signs).',
        },
        { inline_data: { mime_type: mime, data } },
      ],
      64,
    )) as { zone?: string };
    return parsed.zone === "top" || parsed.zone === "middle" || parsed.zone === "bottom" ? parsed.zone : "none";
  } catch (cause) {
    console.error("[captions] burned-in detection failed", cause);
    return "none";
  }
}
