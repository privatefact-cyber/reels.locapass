import { GEMINI_MODEL, geminiGenerateContentUrl } from "@/lib/gemini";

export type GeneratedCaption = { spotName: string; comment: string };

const PROMPT = `あなたは、街で撮った写真をSNSに投稿する本人です。次の写真について、JSONだけを返してください。
- spot_name: 写真に写っている場所・店・もの(看板や建物など)から分かる、スポット名や店名。分からなければ短い場所の呼び名(例: 「海沿いの遊歩道」)。20文字以内。
- comment: 投稿者本人が書いたようなエモい一言日記。40〜60文字、絵文字を1〜2個、口語体。観光ガイドのような説明口調や「おすすめです」「ぜひ」は使わない。
返答の形: {"spot_name": "...", "comment": "..."}`;

/** 写真から、店名と一言コメントを1回で生成する。失敗したらnull(呼び出し側で手入力に任せる)。 */
export async function generateCaption(
  image: Buffer,
  mimeType: string,
  address: string,
  language = "日本語",
): Promise<GeneratedCaption | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(geminiGenerateContentUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${PROMPT}\n- comment は ${language} で書く(文体の指定は同じ)。spot_name は看板などに書かれている表記のまま(元の言語)にする。${address ? `\n\n撮影場所の住所: ${address}` : ""}` },
              { inline_data: { mime_type: mimeType, data: image.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
    });
    if (!res.ok) {
      console.error(`photo caption: ${GEMINI_MODEL} ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { spot_name?: unknown; comment?: unknown };
    const spotName = typeof parsed.spot_name === "string" ? parsed.spot_name.trim().slice(0, 100) : "";
    const comment = typeof parsed.comment === "string" ? parsed.comment.trim().slice(0, 200) : "";
    return spotName || comment ? { spotName, comment } : null;
  } catch (e) {
    console.error("photo caption failed", e);
    return null;
  }
}
