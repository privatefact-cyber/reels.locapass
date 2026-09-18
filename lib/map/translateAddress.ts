import { geminiGenerateContentUrl } from "@/lib/gemini";

/**
 * 日本語の住所を英語表記に変換する(サーバー専用)。
 *
 * 目的は翻訳そのものより「ローマ字の地名を検索で引けるようにすること」。
 * 店長には日本語住所だけを入力してもらい、英語表記は裏で自動生成する
 * (英語入力を求めると運用が破綻するため)。
 *
 * 生成結果は shops.address_en に入り、マップ検索(/api/venues/search)が
 * "shinjuku" / "kabukicho" のようなローマ字入力を拾うのに使う。
 */
export async function translateAddressesToEnglish(
  addresses: string[],
): Promise<(string | null)[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  if (addresses.length === 0) return [];

  const prompt = [
    "Convert each Japanese address into its standard English (romaji) form.",
    "Rules:",
    "- Keep the same order as the input array.",
    "- Use Hepburn romanization for place names (歌舞伎町 -> Kabukicho, 新宿区 -> Shinjuku-ku).",
    "- Write the address in English order: building/floor, block numbers, district, ward, city, prefecture.",
    "- Keep building names romanized; do not translate them into English words.",
    "- Return ONLY a JSON array of strings, one per input, no markdown fence.",
    "",
    JSON.stringify(addresses, null, 0),
  ].join("\n");

  const res = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    throw new Error(`翻訳APIエラー: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return addresses.map(() => null);
  }
  if (!Array.isArray(parsed)) return addresses.map(() => null);

  // 件数がずれた応答は信用しない(入力と対応が取れなくなるため)。
  if (parsed.length !== addresses.length) return addresses.map(() => null);

  return parsed.map((v) => (typeof v === "string" && v.trim() ? v.trim() : null));
}

/** 1件だけ変換する薄いラッパー(管理画面の保存時に使う)。 */
export async function translateAddressToEnglish(address: string): Promise<string | null> {
  const [result] = await translateAddressesToEnglish([address]);
  return result ?? null;
}
