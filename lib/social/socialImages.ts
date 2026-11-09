import sharp from "sharp";
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
  const jpeg = await sharp(input).rotate().resize(1080, 1080, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
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
export async function generateAiImage(theme: string, account: "locapass" | "luxela" = "locapass"): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const prompt = account === "luxela"
    ? `日本の夜の繁華街の、大人っぽく落ち着いた雰囲気の写真風の画像。ネオンや街灯、グラスや店先の明かりなど。テーマ: ${theme}。人物の顔・文字・ロゴ・看板の文字・露出の多い表現は入れない。`
    : `日本の街の、あたたかい雰囲気の写真風の画像。テーマ: ${theme}。自然光、スマホで撮ったような自然な構図。人物の顔・文字・ロゴ・看板の文字は入れない。`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`画像の生成に失敗しました(${res.status})`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("画像が返ってきませんでした");
  return toSquareJpegUrl(Buffer.from(b64, "base64"));
}
