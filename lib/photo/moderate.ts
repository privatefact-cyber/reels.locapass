import { GEMINI_MODEL, geminiGenerateContentUrl } from "@/lib/gemini";
import { PHOTO_TAGS } from "@/lib/photo/tags";

export type Moderation = { appropriate: boolean; rejectReason: string | null; tags: string[] };

const PROMPT = `あなたは観光・街歩きポータルに投稿された写真の審査員です。次の2つを判定し、JSONだけを返してください。
1. is_appropriate: 公開してよい写真か。次は不適切(false)にする: 露骨な性的表現、暴力・流血、違法行為、他人の顔が主題の盗撮風の写真、スクリーンショット、書類や文書の撮影、ほとんど何も写っていない低品質な写真。
   次は適切(true)にする: 海水浴・プールの水着姿、サウナ・温泉・足湯のバスタオル姿(性的な意図の構図でない場合)、ペットや食事や風景の写真。
2. tags: 写真の内容に合うタグを、次の候補から0〜3個選ぶ(候補にないものは作らない): ${PHOTO_TAGS.join("、")}
不適切のとき reject_reason に、投稿者にそのまま見せられる短い日本語の理由を入れる。
返答の形: {"is_appropriate": true, "reject_reason": null, "tags": ["グルメ"]}`;

/**
 * 画像をGeminiに渡して、公開してよいかの判定とタグ付けを1回で行う。
 * Geminiが未設定・失敗のときは「通す(タグなし)」にして、AIの障害で投稿機能が止まらないようにする。
 */
export async function moderateAndTag(
  image: Buffer,
  mimeType: string,
  spotName: string,
  comment: string,
  language = "日本語",
): Promise<Moderation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { appropriate: true, rejectReason: null, tags: [] };

  try {
    const res = await fetch(geminiGenerateContentUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${PROMPT}\nreject_reason は ${language} で書く。\n\nスポット名: ${spotName}\nコメント: ${comment}` },
              { inline_data: { mime_type: mimeType, data: image.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      console.error(`photo moderation: ${GEMINI_MODEL} ${res.status}`);
      return { appropriate: true, rejectReason: null, tags: [] };
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { appropriate: true, rejectReason: null, tags: [] };
    const parsed = JSON.parse(text) as { is_appropriate?: boolean; reject_reason?: string | null; tags?: unknown };
    const allowed = new Set<string>(PHOTO_TAGS);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string" && allowed.has(t)).slice(0, 3)
      : [];
    if (parsed.is_appropriate === false) {
      return { appropriate: false, rejectReason: parsed.reject_reason || null, tags: [] };
    }
    return { appropriate: true, rejectReason: null, tags };
  } catch (e) {
    console.error("photo moderation failed", e);
    return { appropriate: true, rejectReason: null, tags: [] };
  }
}
