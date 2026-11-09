import sharp from "sharp";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import { uploadThumb } from "@/lib/embed-post/createEmbedPost";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";

/**
 * SNS投稿用の画像を、自動で用意する。
 * C: 掲載店舗が自分でアップロードした写真(規約の宣伝・広報の許諾の範囲)。Google Places写真は使わない。
 * B: AI(Gemini)で、街・お店の雰囲気の画像を作る。
 * どちらも、Instagramの条件(JPEG・正方形)に整えて、公開URLで返す。
 */
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

/** 画像を、1080×1080のJPEG(中央を切り抜き)にして、公開URLにする。 */
async function toSquareJpegUrl(input: Buffer): Promise<string> {
  return toJpegUrl(input, 1080, 1080);
}

async function toJpegUrl(input: Buffer, width: number, height: number): Promise<string> {
  const jpeg = await sharp(input).rotate().resize(width, height, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  const ab = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer;
  const url = await uploadThumb(createAdminClient(), ab, "image/jpeg");
  if (!url) throw new Error("画像のアップロードに失敗しました");
  return url;
}

export type ShopPhoto = { imageUrl: string; shopName: string; shopCode: string | null; description: string; instagramHandle: string | null; recentlyUsedKey: string };

/** C: 掲載店舗の写真を1枚選ぶ(最近使っていない店を優先)。account=luxela のときは、LUXELAの店舗(shops)から選ぶ。 */
export async function pickShopPhoto(recentShopKeys: string[], account: "locapass" | "luxela" = "locapass"): Promise<ShopPhoto> {
  const admin = createAdminClient() as any;
  const isLuxela = account === "luxela";
  const { data, error } = isLuxela
    ? await admin.from("shops").select("id, name, shop_code, tagline, description, cover_image_url, sns_links, genre").eq("status", "active").not("cover_image_url", "is", null).not("shop_code", "is", null).limit(300)
    : await admin.from("locapass_shops").select("id, name, shop_code, tagline, description, cover_url, sns_links").eq("status", "active").not("cover_url", "is", null).limit(300);
  if (error) throw new Error(`店舗の取得に失敗しました: ${error.message}`);
  const coverOf = (s: any): string | null => (isLuxela ? s.cover_image_url : s.cover_url) ?? null;
  const usable = ((data ?? []) as any[]).filter((s) => {
    const cover = coverOf(s);
    return cover && !isPlacePhotoUrl(cover) && sanitizeImageUrl(cover) && !/\[?(サンプル|デモ)/.test(s.name) && s.genre !== "運営";
  });
  if (usable.length === 0) throw new Error("使える店舗写真がありません");
  const fresh = usable.filter((s) => !recentShopKeys.includes(s.id));
  const pool = fresh.length ? fresh : usable;
  const shop = pool[Math.floor(Math.random() * pool.length)];
  const res = await fetch(sanitizeImageUrl(coverOf(shop))!, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`店舗写真の取得に失敗しました(${res.status})`);
  const imageUrl = await toSquareJpegUrl(Buffer.from(await res.arrayBuffer()));
  const handle = String(shop.sns_links?.instagram ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/@?].*$/, "").replace(/^@/, "");
  const text = String(shop.tagline || shop.description || "").replace(/\s+/g, " ").trim().slice(0, 90);
  return { imageUrl, shopName: shop.name, shopCode: shop.shop_code ?? null, description: text, instagramHandle: /^[\w.]{1,30}$/.test(handle) ? handle : null, recentlyUsedKey: shop.id };
}

/** B: テーマに合う、街・お店の雰囲気の画像をAIで作る。人物の顔・文字・ロゴは入れない。 */
export type AiImageStyle = "photo" | "illustration" | "flyer";

export async function generateAiImage(theme: string, account: "locapass" | "luxela" = "locapass", opts: { style?: AiImageStyle; aspect?: "1:1" | "9:16"; headline?: string; scene?: string } = {}): Promise<string> {
  const style = opts.style ?? "photo";
  const aspect = opts.aspect ?? "1:1";
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const brand = account === "luxela" ? "LUXELA" : "LOCAPASS";
  const noText = "画像の中には、テーマ名・説明文・日付・ウォーターマークなどの文字を、一切書かない。";
  const headline = (opts.headline ?? "").replace(/\s+/g, " ").trim().slice(0, 20) || brand;
  const look = style === "illustration" ? "おしゃれで上品な、手描き風のイラスト" : "写真風の画像";
  // チラシの文字は、AIに描かせると崩れるため、ここでは文字なしのイラストだけを作る(見出しは、管理画面のブラウザで正しいフォントで重ねる)。
  const flyerPrompt = `SNSのチラシの背景にする、おしゃれな${account === "luxela" ? "夜の街(ネオン・落ち着いた大人の雰囲気)" : "街のお店(あたたかい雰囲気)"}のイラスト。中央に、あとで文字を重ねられる、すっきりした広めの余白を残す。文字・ロゴ・看板の文字は一切入れない。人物の顔は描かない。題材(これは画像に書かない): ${opts.scene || theme}。`;
  // 投稿の文章から決めた「場面」があるときは、それを主役にして描く(雰囲気だけの絵にしない)。
  const scenePrompt = opts.scene
    ? `${look}。場面: ${opts.scene}。この場面の中心になる物や状況を、はっきり大きく写す。${account === "luxela" ? "夜のお店らしい、落ち着いた暗めの照明と大人っぽい色調。" : "あたたかい自然光。"}${style === "photo" ? "スマホで撮ったような自然な構図。" : "すっきりした構図。"}人物の顔・文字・ロゴ・看板の文字・画面の中の文字・露出の多い表現は入れない。` + noText
    : null;
  const prompt = scenePrompt && style !== "flyer" ? scenePrompt : (style === "flyer" ? flyerPrompt : account === "luxela"
    ? `日本の夜の繁華街の、大人っぽく落ち着いた雰囲気の${look}。ネオンや街灯、グラスや店先の明かりなど。題材(これは画像に書かない): ${theme}。人物の顔・文字・ロゴ・看板の文字・露出の多い表現は入れない。`
    : `日本の街の、あたたかい雰囲気の${look}。題材(これは画像に書かない): ${theme}。${style === "photo" ? "自然光、スマホで撮ったような自然な構図。" : "やさしい色合いで、すっきりした構図。"}人物の顔・文字・ロゴ・看板の文字は入れない。`) + noText;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], ...(aspect === "9:16" ? { imageConfig: { aspectRatio: "9:16" } } : {}) } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`画像の生成に失敗しました(${res.status})`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("画像が返ってきませんでした");
  return aspect === "9:16" ? toJpegUrl(Buffer.from(b64, "base64"), 1080, 1920) : toSquareJpegUrl(Buffer.from(b64, "base64"));
}

/**
 * 完成した投稿の文章を読んで、添える画像の「場面」を1〜2文で決める。
 * 画像を話題の見出しだけで作ると、文章と関係のない雰囲気の絵になるため、文章の中心の1点を物や状況で表す。
 * 失敗したら空文字を返す(呼び出し側は、これまでの作り方に戻る)。
 */
export async function imageSceneFromPost(body: string, account: "locapass" | "luxela" = "locapass"): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !body.trim()) return "";
  const who = account === "luxela" ? "夜のお店(キャバクラ・ラウンジ・ガールズバー等)のオーナーや店長" : "地域のお店のオーナーや、街のお店を探す人";
  const prompt = `次のSNS投稿に添える画像の「場面の指示」を、日本語1〜2文で書いてください。読み手は${who}です。
- 投稿が伝えたい中心の1点(現場の課題・仕様・発見)を、見ただけで連想できる、具体的な物や状況にする。
- 例: 出勤の調整なら「手帳に書き込まれた出勤表と、横に置かれたスマホ」、閉店後の作業なら「片付けられたカウンターに置かれたタブレット」。
- 夜景やネオンなど、雰囲気だけの絵にしない。投稿の話題が分かる物を主役にする。
- 人物の顔は写さない。人を入れるなら手元か後ろ姿だけ。
- 画像に入れる文字は指示しない。投稿の文章を書き写さない。

投稿:
${body.slice(0, 700)}

JSONだけを返す: {"scene": "場面の指示"}`;
  try {
    const res = await geminiGenerateWithFallback(key, { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } }, "social-image-scene", 30_000);
    if (!res) { console.error("social-image-scene: no response"); return ""; }
    const json = (await res.json()) as any;
    const text = String(json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "").trim();
    // JSONで返らなくても(前置き・コードブロック付きでも)、scene の値を取り出す。
    const match = text.match(/\{[\s\S]*\}/);
    let scene = "";
    if (match) { try { scene = String((JSON.parse(match[0]) as { scene?: string }).scene ?? ""); } catch { /* 下で本文から取る */ } }
    if (!scene) scene = text.replace(/```[a-z]*|```|^\s*\{?\s*"?scene"?\s*:\s*"?|"?\s*\}?\s*$/gi, "");
    scene = scene.replace(/\s+/g, " ").trim();
    if (scene.length < 8) console.error(`social-image-scene: empty (${text.slice(0, 120)})`);
    return scene.length >= 8 ? scene.slice(0, 220) : "";
  } catch (e) {
    console.error("social-image-scene: failed", e);
    return "";
  }
}
