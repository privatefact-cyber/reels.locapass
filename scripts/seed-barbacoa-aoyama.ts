/**
 * 実在店「バルバッコア 青山本店」(https://barbacoa.jp/pages/aoyama)を青山(渋谷ポータル)に、ポルトガル語の原文で登録する。
 * 店舗情報・メニューは公式サイトの記載どおり。写真は店舗から使用許可を得て公式サイトから取得したもの
 * (scripts の引数に写真フォルダを渡す)。日・英・中・アラビア語へ翻訳する。何度実行しても同じ結果(slugで上書き)。
 *
 *   node --import tsx scripts/seed-barbacoa-aoyama.ts <写真フォルダ>
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { translateFields } from "../lib/i18n/contentTranslation";
import { translatePriceItemNames } from "../lib/shop/shopTranslations";
import { geocodeAddress } from "../lib/map/addressGeocode";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const PORTAL_ID = 407; // shibuya
const SLUG = "barbacoa-aoyama";
const ADDRESS = "東京都渋谷区神宮前4-3-2 TOKYU REIT表参道スクエア B1F";

const fields = {
  tagline: "Churrascaria brasileira em Omotesando — rodízio com 182 lugares",
  description:
    "A Barbacoa Aoyama Honten é uma churrascaria brasileira com um salão enorme de 182 lugares, dividido em três ambientes: salão principal, balcão e área ao lado da adega. Do salão principal e do balcão você vê a máquina do churrasco em ação e aproveita a refeição com todo o clima da casa.\nOs churrasqueiros cortam na sua mesa as carnes assadas lentamente apenas com sal grosso, quantas vezes você quiser. Entre os cortes: cupim, bife de chorizo (contrafilé), picanha, fraldinha, alcatra, picanha com alho, picanha com pimenta, coxa de frango, coração de frango, lombo de porco, linguiça, queijo assado e abacaxi assado. Buffet de saladas e de sobremesas à vontade.",
  business_hours:
    "Almoço (dias úteis): 11:30–15:00 (última entrada 14:00 / último pedido 14:30)\nJantar (dias úteis): 17:30–22:00 (última entrada 21:00 / último pedido 21:30)\nAlmoço (fins de semana e feriados): 11:00–15:30 (última entrada 14:30 / último pedido 15:00)\nJantar (fins de semana e feriados): 17:00–22:00 (última entrada 21:00 / último pedido 21:30)\nTakeout / Delivery: dias úteis 11:30–14:30 (último pedido 14:00) e 17:30–20:30 (último pedido 20:00); fins de semana e feriados 11:00–14:30 (último pedido 14:00) e 17:00–20:30 (último pedido 20:00)",
  price_info:
    "Rodízio de churrasco com buffet de saladas e sobremesas (2 horas): ¥8.800 por pessoa; crianças de 6 a 12 anos: ¥4.000. Os preços do almoço e a carta de vinhos estão no site oficial.",
  usage_notes:
    "Não é possível dividir pratos: faça o pedido para todas as pessoas que forem comer.\nAcesso: 2 minutos a pé da estação Omotesando (Linha Chiyoda); 5 minutos a pé (Linhas Hanzomon e Ginza). Não há estacionamento.\nPagamento: cartões (VISA, Mastercard, JCB, American Express, Diners Club, UnionPay e outros), Apple Pay, Suica, PASMO, Alipay, WeChat Pay, PayPay, LINE Pay, Rakuten Pay, d払い, au PAY. Wi-Fi grátis (peça à equipe).\nAcessibilidade: há degraus na entrada e escada com corrimão; não há elevador.\nFotos: site oficial da Barbacoa, usadas com autorização.",
};

const MENU = [
  { name: "Rodízio de churrasco com saladas e sobremesas (2 horas)", price: 8800 },
  { name: "Criança de 6 a 12 anos (rodízio de 2 horas)", price: 4000 },
];

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("写真フォルダを指定してください");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GEMINI_API_KEY) throw new Error("env missing");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // 写真(使用許可済み)を自前のストレージに置く: [表紙, ギャラリー...]
  const files = ["aoyama_photo_6.jpg", "header_aoyama_pc.jpg", "aoyama_photo_2.jpg", "aoyama_photo_1_1004d4fe-270c-43c5-b6fb-38cc9b182505.jpg", "aoyama_photo_5.jpg"];
  const urls: string[] = [];
  for (const [i, f] of files.entries()) {
    // パスに "/shops/" を含めない(sanitizeImageUrl が古いWP由来のURLとみなして画像を落とすため)。
    const path = `${SLUG}/photo-${i}.jpg`;
    const { error } = await db.storage
      .from("locapass-portal-media")
      .upload(path, readFileSync(join(dir, f)), { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    urls.push(db.storage.from("locapass-portal-media").getPublicUrl(path).data.publicUrl);
  }

  const geo = await geocodeAddress(ADDRESS);
  if (!geo) throw new Error("住所の座標を取得できませんでした");
  console.log("座標:", geo.lat, geo.lng, geo.matched ?? "");

  const translations = await translateFields(fields, "pt");
  if (!translations) throw new Error("翻訳に失敗");

  const row = {
    portal_id: PORTAL_ID,
    slug: SLUG,
    name: "バルバッコア 青山本店(Barbacoa Churrascaria Aoyama)",
    category: "レストラン・食事",
    area: "神宮前・表参道",
    address: ADDRESS,
    address_en: "TOKYU REIT Omotesando Square B1F, 4-3-2 Jingumae, Shibuya-ku, Tokyo",
    lat: geo.lat,
    lng: geo.lng,
    tel: "050-1807-6725",
    url: "https://barbacoa.jp/pages/aoyama",
    cover_url: urls[0],
    gallery_image_urls: urls.slice(1),
    cover_image_attribution: { name: "Barbacoa 公式サイト", uri: "https://barbacoa.jp/pages/aoyama" },
    plan: "free",
    status: "active",
    input_lang: "pt",
    ...fields,
    translations,
  };

  const { data: existing } = await db.from("locapass_shops").select("id").eq("slug", SLUG).maybeSingle();
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

  const nameTranslations = await translatePriceItemNames(MENU.map((m) => m.name), "pt");
  await db.from("locapass_shop_price_items").delete().eq("shop_id", shopId);
  const { error: menuError } = await db.from("locapass_shop_price_items").insert(
    MENU.map((m, i) => ({ shop_id: shopId, name: m.name, price: m.price, display_order: i, name_translations: nameTranslations[i] })),
  );
  if (menuError) throw menuError;
  console.log(`✓ ${row.name} → /shibuya/shops/${SLUG} (${shopId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
