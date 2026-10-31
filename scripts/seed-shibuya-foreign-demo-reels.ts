/**
 * 渋谷のデモ店(スペイン料理・ロシア料理)のリールを、それぞれの母国語の投稿文で1本ずつ投稿する。
 * 写真は店舗に登録済みの写真。日・英・中・アラビア語へ翻訳する。何度実行しても1店1本(作り直す)。
 *
 *   node --import tsx scripts/seed-shibuya-foreign-demo-reels.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { translateFields } from "../lib/i18n/contentTranslation";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const reels = [
  {
    slug: "shibuya-demo-taberna-sol-y-sombra",
    lang: "es",
    tags: ["food", "drink"],
    caption:
      "¡Paella recién hecha en el corazón de Shibuya! 🥘🇪🇸\n\nArroz de calidad, marisco fresco y mucho sabor. La preparamos al momento (unos 25 minutos), ideal para compartir con una copa de vino o una sangría bien fría.\n\n¡Ven a Taberna Sol y Sombra y siéntete como en casa! (Publicación de demostración)\n\n#paella #tapas #sangría #cocinaespañola #shibuya",
  },
  {
    slug: "shibuya-demo-matryoshka",
    lang: "ru",
    tags: ["food", "menu"],
    caption:
      "Горячий шашлык на углях и домашний борщ — в самом центре Сибуя! 🔥🇷🇺\n\nПельмени лепим вручную каждое утро, борщ варим по семейному рецепту. Приходите в «Матрёшку» — у нас говорят по-русски, а вечером можно согреться чаем из самовара.\n\n(Демонстрационная публикация)\n\n#русскаякухня #шашлык #борщ #пельмени #сибуя",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("env missing");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const r of reels) {
    const { data: shop, error } = await db
      .from("locapass_shops")
      .select("id, portal_id, cover_url, gallery_image_urls, input_lang")
      .eq("slug", r.slug)
      .single();
    if (error) throw error;
    if (shop.input_lang !== r.lang) throw new Error(`${r.slug}: 入力言語が ${r.lang} ではありません`);

    const photos = [shop.cover_url as string, ...((shop.gallery_image_urls ?? []) as string[])].filter(Boolean);
    const translations = await translateFields({ caption: r.caption }, r.lang);
    if (!translations) throw new Error(`${r.slug}: 翻訳に失敗`);

    await db.from("locapass_reels").delete().eq("shop_id", shop.id).eq("reel_type", "permanent");
    const { data, error: insertError } = await db
      .from("locapass_reels")
      .insert({
        portal_id: shop.portal_id,
        shop_id: shop.id,
        images: photos.map((u) => ({ url: u })),
        caption: r.caption,
        reel_type: "permanent",
        status: "publish",
        tags: r.tags,
        tags_status: "ready",
        is_placeholder: false,
        is_comments_enabled: true,
        published_at: new Date().toISOString(),
        translations: translations as never,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    console.log(`✓ ${r.slug} (${r.lang}) → ${data.id} 写真${photos.length}枚`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
