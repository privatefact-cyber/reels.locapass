import { categoryToSlug } from "./cityAreas";

/**
 * 「地域 × 業種」ページの英語版(海外からの検索用: "Mito cafe", "Shibuya restaurants" など)。
 * 英語ページは、地名のローマ字が分かっている地域だけを検索に出す(間違った綴りを出さないため)。
 * 表に無い地域の英語ページは、これまでどおり検索に出さない(noindex)。地域が増えたら、ここに1行足す。
 * キーは「都道府県+市区町村」(cityKey)。
 */
const CITY_EN: Record<string, { city: string; pref: string }> = {
  東京都渋谷区: { city: "Shibuya", pref: "Tokyo" },
  東京都港区: { city: "Minato", pref: "Tokyo" },
  東京都千代田区: { city: "Chiyoda", pref: "Tokyo" },
  東京都中央区: { city: "Chuo", pref: "Tokyo" },
  東京都新宿区: { city: "Shinjuku", pref: "Tokyo" },
  東京都豊島区: { city: "Toshima", pref: "Tokyo" },
  東京都台東区: { city: "Taito", pref: "Tokyo" },
  東京都世田谷区: { city: "Setagaya", pref: "Tokyo" },
  東京都目黒区: { city: "Meguro", pref: "Tokyo" },
  東京都江東区: { city: "Koto", pref: "Tokyo" },
  東京都大田区: { city: "Ota", pref: "Tokyo" },
  東京都江戸川区: { city: "Edogawa", pref: "Tokyo" },
  東京都杉並区: { city: "Suginami", pref: "Tokyo" },
  東京都中野区: { city: "Nakano", pref: "Tokyo" },
  東京都町田市: { city: "Machida", pref: "Tokyo" },
  東京都板橋区: { city: "Itabashi", pref: "Tokyo" },
  東京都足立区: { city: "Adachi", pref: "Tokyo" },
  東京都品川区: { city: "Shinagawa", pref: "Tokyo" },
  茨城県水戸市: { city: "Mito", pref: "Ibaraki" },
  茨城県大洗町: { city: "Oarai", pref: "Ibaraki" },
  茨城県日立市: { city: "Hitachi", pref: "Ibaraki" },
  茨城県つくば市: { city: "Tsukuba", pref: "Ibaraki" },
  茨城県笠間市: { city: "Kasama", pref: "Ibaraki" },
  茨城県ひたちなか市: { city: "Hitachinaka", pref: "Ibaraki" },
  神奈川県横浜市: { city: "Yokohama", pref: "Kanagawa" },
  栃木県那須町: { city: "Nasu", pref: "Tochigi" },
  栃木県那須塩原市: { city: "Nasushiobara", pref: "Tochigi" },
  千葉県南房総市: { city: "Minamiboso", pref: "Chiba" },
  埼玉県さいたま市: { city: "Saitama", pref: "Saitama" },
  滋賀県大津市: { city: "Otsu", pref: "Shiga" },
};

export function cityEn(key: string): { city: string; pref: string } | null {
  return CITY_EN[key] ?? null;
}

const CATEGORY_EN: Record<string, { name: string; word: string }> = {
  "カフェ・スイーツ": { name: "Cafes & Sweets", word: "Cafes" },
  "レストラン・食事": { name: "Restaurants & Lunch", word: "Restaurants" },
  "居酒屋・バー": { name: "Izakaya & Bars", word: "Izakaya & Bars" },
  ショッピング: { name: "Shops & Goods", word: "Shops" },
  "観光・体験": { name: "Sightseeing & Experiences", word: "Things to Do" },
  宿泊: { name: "Hotels & Stays", word: "Hotels" },
  ペット: { name: "Pet-friendly Places", word: "Pet-friendly Places" },
  "美容・暮らし": { name: "Salons & Beauty", word: "Salons" },
  コミュニティ: { name: "Community Spaces", word: "Community Spaces" },
  "習い事・教室": { name: "Classes & Lessons", word: "Classes" },
};

export function categoryEn(category: string): { name: string; word: string } | null {
  return CATEGORY_EN[category] ?? null;
}

/** この「地域 × 業種」ページを、英語でも検索に出してよいか(地名と業種の英語が分かっていて、店舗が基準数以上)。 */
export function englishIndexable(cityKeyStr: string, category: string, shopCount: number, min: number): boolean {
  return shopCount >= min && !!cityEn(cityKeyStr) && !!categoryEn(category) && !!categoryToSlug(category);
}

export type CityCategoryCopy = {
  title: string;
  description: (names: string, prefecture: string) => string;
  h1: string;
  intro: (count: number, prefecture: string, towns: string[]) => string;
  listHeading: (count: number) => string;
  home: string;
  areas: string;
  otherShops: string;
  otherAreas: string;
  mapLink: string;
  breadcrumbHome: string;
};

/** 英語のページの文言。city/categoryはローマ字・英語に直したもの。 */
export function englishCopy(args: { city: string; pref: string; category: string; count: number; word: string }): CityCategoryCopy {
  const { city, pref, category, count, word } = args;
  return {
    title: `${word} in ${city}: ${count} Spots in Short Videos`,
    description: (names) => `Find ${count} ${category.toLowerCase()} in ${city}, ${pref}${names ? `, including ${names}` : ""}. Preview each place with short videos (reels) before you go.`,
    h1: `${word} in ${city}`,
    intro: (n, p, towns) => `Looking for ${word.toLowerCase()} in ${city}? Browse ${n} ${category.toLowerCase()} in ${city}, ${p}${towns.length ? ` — areas like ${towns.join(", ")}` : ""}. See each place's atmosphere in short videos (reels) before you choose.`,
    listHeading: (n) => `${word} in ${city} (${n})`,
    home: "Home",
    areas: "Areas",
    otherShops: `More places in ${city}`,
    otherAreas: `${word} in other areas`,
    mapLink: `Find places in ${city} on the map`,
    breadcrumbHome: "Home",
  };
}

