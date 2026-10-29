import { geminiGenerateWithFallback } from "@/lib/gemini";
import { PHOTO_TAGS } from "@/lib/photo/tags";

export type Moderation = { appropriate: boolean; rejectReason: string | null; tags: string[] };

const PROMPT = `あなたは街歩き・お店紹介ポータルに投稿された写真・動画(の1コマ)の審査員です。店舗や事業者が宣伝目的で投稿することも普通にあるので、審査はゆるめに行い、迷ったら必ず公開(true)にしてください。次の2つを判定し、JSONだけを返してください。
1. is_appropriate: 公開してよいか。不適切(false)にするのは、次のように「明らかに問題がある」場合だけ:
   露骨な性的表現(性器・性行為)、残虐な暴力・流血、違法行為(薬物など)、他人の顔が主題で明らかに本人に無断の盗撮風の写真、他人の個人情報(免許証・保険証・クレジットカード等)の撮影。
   次は必ず適切(true)にする。理由にしてはいけない:
   - お店のメニュー、看板、チラシ、価格表、店内の案内、商品・料理・施術・内装の写真
   - プロモーション動画・告知動画・広告風の画像(CapCut等で編集した文字・テロップ・ロゴ・BGM演出・ステッカー・枠・フィルターが載っているもの、タイトルや文字だけの場面を含む)
   - 暗い・ぶれている・一部が隠れている・被写体が小さい・画面が切り替わる途中のコマ(動画の1コマなので、画質や構図は問わない)
   - 人物の写真(スタッフ・施術・ポーズ・ダンス・店内の様子)、ペット、食事、風景
   - 海水浴・プールの水着姿、サウナ・温泉・足湯のバスタオル姿、通常のファッション・トレーニングウェア(性的な意図の構図でない場合)
   - 画面の一部がスクリーンショット風でも、お店や街の紹介として使えるもの
2. tags: 写真の内容に合うタグを、次の候補から0〜3個選ぶ(候補にないものは作らない。合うものがなければ空でよい): ${PHOTO_TAGS.join("、")}
不適切のとき reject_reason に、どこが問題かが分かる短い日本語の理由を入れる(「被写体が確認できない」「画質が低い」などは理由にしない)。
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
    const res = await geminiGenerateWithFallback(
      apiKey,
      {
        contents: [
          {
            parts: [
              { text: `${PROMPT}\nreject_reason は ${language} で書く。\n\nスポット名: ${spotName}\nコメント: ${comment}` },
              { inline_data: { mime_type: mimeType, data: image.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      },
      "photo moderation",
    );
    if (!res) return { appropriate: true, rejectReason: null, tags: [] };
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
