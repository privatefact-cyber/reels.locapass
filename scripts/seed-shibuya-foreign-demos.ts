/**
 * 渋谷ポータルに、母国語で作った外国料理のデモ店(スペイン料理・ロシア料理)を登録する。
 * 原文は入力言語(es / ru)のまま保存し、日・英・中・アラビア語へ翻訳する。何度実行しても同じ結果(slugで上書き)。
 *
 *   node --import tsx scripts/seed-shibuya-foreign-demos.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { translateFields } from "../lib/i18n/contentTranslation";
import { translatePriceItemNames } from "../lib/shop/shopTranslations";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const PORTAL_ID = 407; // shibuya
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

type Demo = {
  slug: string;
  inputLang: "es" | "ru";
  name: string;
  tagline: string;
  description: string;
  business_hours: string;
  price_info: string;
  usage_notes: string;
  address: string;
  address_en: string;
  lat: number;
  lng: number;
  cover: string;
  gallery: string[];
  menu: { name: string; price: number }[];
};

const demos: Demo[] = [
  {
    slug: "shibuya-demo-taberna-sol-y-sombra",
    inputLang: "es",
    name: "Taberna Sol y Sombra (Demo)",
    tagline: "Auténtica cocina española en el corazón de Shibuya",
    description:
      "Una taberna familiar con el sabor de casa. Preparamos la paella al momento, con arroz de calidad y marisco fresco, y servimos tapas para compartir junto a una copa de vino o una sangría bien fría.\nAquí se habla español y se vive el ambiente de una taberna de Madrid. (Sitio de demostración)",
    business_hours: "Almuerzo 11:30–14:30 / Cena 17:30–23:00\nLos lunes cerrado",
    price_info: "Precios con impuestos incluidos. Aceptamos tarjetas y PayPay. (Demo)",
    usage_notes: "Para grupos de más de 4 personas recomendamos reservar. La paella tarda unos 25 minutos en prepararse.",
    address: "東京都渋谷区道玄坂(デモ)",
    address_en: "Dogenzaka, Shibuya-ku, Tokyo",
    lat: 35.6586,
    lng: 139.6984,
    cover: unsplash("1515443961218-a51367888e4b"),
    gallery: [unsplash("1534080564583-6be75777b70a")],
    menu: [
      { name: "Paella de mariscos (para 2 personas)", price: 3800 },
      { name: "Tortilla española", price: 980 },
      { name: "Gambas al ajillo", price: 1480 },
      { name: "Jamón ibérico", price: 1800 },
      { name: "Menú del día", price: 1650 },
      { name: "Sangría (jarra)", price: 2400 },
    ],
  },
  {
    slug: "shibuya-demo-matryoshka",
    inputLang: "ru",
    name: "Ресторан «Матрёшка» (Демо)",
    tagline: "Настоящая русская кухня в Сибуя",
    description:
      "Уютный ресторан с домашней русской кухней. Борщ варится по семейному рецепту, пельмени лепим вручную каждое утро, а шашлык жарим на углях.\nУ нас говорят по-русски, а по вечерам можно согреться чаем из самовара. (Демонстрационная страница)",
    business_hours: "Пн–Пт 17:00–23:00 / Сб–Вс 12:00–23:00\nВыходной — вторник",
    price_info: "Цены указаны с налогом. Принимаем карты и PayPay. (Демо)",
    usage_notes: "Для компаний от 5 человек рекомендуем бронировать столик заранее. Блюда на углях готовятся около 20 минут.",
    address: "東京都渋谷区神南(デモ)",
    address_en: "Jinnan, Shibuya-ku, Tokyo",
    lat: 35.6615,
    lng: 139.6993,
    cover: unsplash("1555939594-58d7cb561ad1"),
    gallery: [unsplash("1603105037880-880cd4edfb0d")],
    menu: [
      { name: "Борщ с говядиной", price: 1200 },
      { name: "Пельмени домашние", price: 1380 },
      { name: "Шашлык из баранины", price: 2200 },
      { name: "Бефстроганов", price: 1850 },
      { name: "Блины с икрой", price: 1900 },
      { name: "Квас", price: 600 },
    ],
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("env missing");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const d of demos) {
    const fields = {
      description: d.description,
      tagline: d.tagline,
      business_hours: d.business_hours,
      price_info: d.price_info,
      usage_notes: d.usage_notes,
    };
    const translations = await translateFields(fields, d.inputLang);
    if (!translations) throw new Error(`翻訳に失敗: ${d.name}`);

    const row = {
      portal_id: PORTAL_ID,
      slug: d.slug,
      name: d.name,
      category: "レストラン・食事",
      area: "渋谷区",
      address: d.address,
      address_en: d.address_en,
      lat: d.lat,
      lng: d.lng,
      cover_url: d.cover,
      gallery_image_urls: d.gallery,
      plan: "free",
      status: "active",
      input_lang: d.inputLang,
      ...fields,
      translations,
    };

    const { data: existing } = await db.from("locapass_shops").select("id").eq("slug", d.slug).maybeSingle();
    let shopId = existing?.id as string | undefined;
    if (shopId) {
      const { error } = await db.from("locapass_shops").update(row).eq("id", shopId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("locapass_shops")
        .insert({ ...row, shop_code: randomBytes(3).toString("hex").toUpperCase() })
        .select("id")
        .single();
      if (error) throw error;
      shopId = data.id;
    }

    const nameTranslations = await translatePriceItemNames(d.menu.map((m) => m.name), d.inputLang);
    await db.from("locapass_shop_price_items").delete().eq("shop_id", shopId);
    const { error: menuError } = await db.from("locapass_shop_price_items").insert(
      d.menu.map((m, i) => ({
        shop_id: shopId,
        name: m.name,
        price: m.price,
        display_order: i,
        name_translations: nameTranslations[i],
      })),
    );
    if (menuError) throw menuError;
    console.log(`✓ ${d.name} → /shibuya/shops/${d.slug} (${shopId})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
