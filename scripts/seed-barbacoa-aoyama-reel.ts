/**
 * バルバッコア 青山本店(slug: barbacoa-aoyama)の公式リールを、ポルトガル語の投稿文で1本投稿する。
 * 写真は seed-barbacoa-aoyama.ts で置いた店舗の写真(使用許可済み)を使う。日・英・中・アラビア語へ翻訳する。
 * 既にこのスクリプトの投稿がある場合は作り直す(店舗の slug と投稿文の先頭で判定)。
 *
 *   node --import tsx scripts/seed-barbacoa-aoyama-reel.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { translateFields } from "../lib/i18n/contentTranslation";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SLUG = "barbacoa-aoyama";
const CAPTION =
  "Bem-vindo à Barbacoa Aoyama, em Omotesando! 🇧🇷🔥\n\nCarnes assadas só com sal grosso e cortadas na sua mesa: picanha, fraldinha, cupim, alcatra, linguiça e muito mais. Buffet de saladas e de sobremesas à vontade, tudo no rodízio de 2 horas.\n\nUm salão com 182 lugares, a 2 minutos a pé da estação Omotesando. Venha matar a saudade do Brasil!\n\n#churrasco #rodizio #omotesando #aoyama #comidabrasileira";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("env missing");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: shop, error } = await db
    .from("locapass_shops")
    .select("id, portal_id, cover_url, gallery_image_urls, input_lang")
    .eq("slug", SLUG)
    .single();
  if (error) throw error;
  if (shop.input_lang !== "pt") throw new Error("店舗の入力言語がptではありません");

  // 縦長のリールに合う写真(表紙=客席、ギャラリー: [横長ヘッダー, サラダ, デザート, 客席])。横長ヘッダーは使わない。
  const gallery = (shop.gallery_image_urls ?? []) as string[];
  const photos = [shop.cover_url as string, gallery[1], gallery[2], gallery[3]].filter(Boolean);

  const translations = await translateFields({ caption: CAPTION }, "pt");
  if (!translations) throw new Error("翻訳に失敗");

  await db.from("locapass_reels").delete().eq("shop_id", shop.id).like("caption", "Bem-vindo à Barbacoa Aoyama%");
  const { data, error: insertError } = await db
    .from("locapass_reels")
    .insert({
      portal_id: shop.portal_id,
      shop_id: shop.id,
      images: photos.map((u) => ({ url: u })),
      caption: CAPTION,
      reel_type: "permanent",
      status: "publish",
      tags: ["interior", "food", "sweets"],
      tags_status: "ready",
      is_placeholder: false,
      is_comments_enabled: true,
      published_at: new Date().toISOString(),
      translations: translations as never,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  console.log(`✓ リールを投稿しました (${data.id}) 写真${photos.length}枚`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
