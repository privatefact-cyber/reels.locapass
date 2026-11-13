import { cache } from "react";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { createStaticClient } from "@/lib/supabase/static";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { isDemoShop } from "./demo";

/**
 * 「地域 × 業種」の検索(例: 渋谷区 カフェ、水戸市 居酒屋)に出るためのページ用のデータ。
 * 「地域」は、店舗の住所から市区町村を取り出して決める(ポータルは掲載の枠組みで、検索される地名とは別なので)。
 * 店舗が増えれば、地域もページも自動で増える。
 */

export const SITE_URL = "https://locapass.net";

/** 業種(locapass_shops.category)とURLの対応。「その他」は検索される切り口ではないので、ページを作らない。 */
export const CATEGORY_SLUGS: Record<string, string> = {
  "カフェ・スイーツ": "cafe-sweets",
  "レストラン・食事": "restaurant",
  "居酒屋・バー": "izakaya-bar",
  ショッピング: "shopping",
  "観光・体験": "sightseeing",
  宿泊: "stay",
  ペット: "pet",
  "美容・暮らし": "beauty",
  コミュニティ: "community",
  "習い事・教室": "lessons",
};

export function categoryToSlug(category: string): string | null {
  return CATEGORY_SLUGS[category] ?? null;
}

export function slugToCategory(slug: string): string | null {
  return Object.entries(CATEGORY_SLUGS).find(([, s]) => s === slug)?.[0] ?? null;
}

/** 業種ページのタイトルに使う、検索されやすい言い方。 */
const CATEGORY_KEYWORD: Record<string, string> = {
  "カフェ・スイーツ": "カフェ・スイーツ",
  "レストラン・食事": "レストラン・ランチ",
  "居酒屋・バー": "居酒屋・バー",
  ショッピング: "ショップ・雑貨",
  "観光・体験": "観光スポット・体験",
  宿泊: "ホテル・宿泊施設",
  ペット: "ペット同伴OKのお店",
  "美容・暮らし": "美容室・ネイル・サロン",
  コミュニティ: "交流スペース・コミュニティ",
  "習い事・教室": "習い事・教室",
};
export function categoryKeyword(category: string): string {
  return CATEGORY_KEYWORD[category] ?? category;
}

/** 内容が薄いページを検索に出さないための、最低店舗数(エリアガイドと同じ基準)。 */
export const MIN_SHOPS_FOR_CITY_PAGE = 3;

export type ParsedAddress = { prefecture: string; city: string; town: string | null };

const PREFECTURE = /^(?:〒?\s*\d{3}-?\d{4}\s*)?(北海道|東京都|京都府|大阪府|[^\s都道府県\d]{2,3}県)/;

/**
 * 住所から都道府県・市区町村(・町名)を取り出す。
 * 「東京都渋谷区神宮前3-1」→ 東京都 / 渋谷区 / 神宮前、「神奈川県横浜市西区…」→ 横浜市(区は含めない)、
 * 「栃木県那須郡那須町…」→ 那須町。読み取れない住所は null。
 */
export function parseAddress(address: string | null | undefined): ParsedAddress | null {
  if (!address) return null;
  const normalized = address.replace(/\s+/g, " ").trim();
  const pm = normalized.match(PREFECTURE);
  if (!pm) return null;
  const prefecture = pm[1];
  let rest = normalized.slice(pm[0].length).trim();
  // 「那須郡那須町」の郡は飛ばす
  const gun = rest.match(/^[^\s市区町村郡\d]{1,6}郡/);
  if (gun) rest = rest.slice(gun[0].length);
  const cm = rest.match(/^[^\s\d]{1,8}?[市区町村]/);
  if (!cm) return null;
  let city = cm[0];
  // 「四日市市」「大町市」のように、地名の途中に市・町が入るものは、次の「市」まで含める
  if (rest[city.length] === "市" && /[市町村]$/.test(city)) city += "市";
  const after = rest.slice(city.length);
  const tm = after.match(/^([^\s\d０-９\-ー－丁]{1,8})/);
  return { prefecture, city, town: tm ? tm[1] : null };
}

/** 地域のキー(URLに使う)。例: 東京都渋谷区。 */
export function cityKey(p: { prefecture: string; city: string }): string {
  return `${p.prefecture}${p.city}`;
}

export function cityUrl(key: string): string {
  return `${SITE_URL}/areas/c/${encodeURIComponent(key)}`;
}
export function cityCategoryUrl(key: string, categorySlug: string): string {
  return `${cityUrl(key)}/${categorySlug}`;
}
/** サイト内リンク用(LocaleLinkに渡す、ドメインなしのパス)。 */
export function cityPath(key: string): string {
  return `/areas/c/${encodeURIComponent(key)}`;
}
export function cityCategoryPath(key: string, categorySlug: string): string {
  return `${cityPath(key)}/${categorySlug}`;
}

export type CityShop = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: string | null;
  address: string | null;
  coverUrl: string | null;
  portalSlug: string;
  town: string | null;
};

export type CityArea = {
  key: string;
  prefecture: string;
  city: string;
  shops: CityShop[];
  /** 業種ごとの店舗(ページを作る業種だけ) */
  byCategory: Map<string, CityShop[]>;
};

type Row = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: string | null;
  address: string | null;
  cover_url: string | null;
  portal: { slug: string } | { slug: string }[] | null;
};

/** 掲載中の店舗(デモ・公式を除く)を、住所の市区町村ごとにまとめる。店舗の多い地域が先。 */
export const getCityAreas = cache(async (): Promise<CityArea[]> => {
  const supabase = createStaticClient();
  const rows = await fetchAllRows<Row>(
    (from, to) =>
      supabase
        .from("locapass_shops")
        .select("id, slug, name, tagline, category, address, cover_url, portal:locapass_portals ( slug )")
        .eq("status", "active")
        .or(EXCLUDE_OFFICIAL_FILTER)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  );

  const areas = new Map<string, CityArea>();
  for (const r of rows) {
    if (isDemoShop(r.name, r.slug)) continue;
    const portal = Array.isArray(r.portal) ? r.portal[0] : r.portal;
    const parsed = parseAddress(r.address);
    if (!portal || !parsed) continue;
    const key = cityKey(parsed);
    const area: CityArea = areas.get(key) ?? { key, prefecture: parsed.prefecture, city: parsed.city, shops: [], byCategory: new Map() };
    const shop: CityShop = {
      id: r.id,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      category: r.category,
      address: r.address,
      coverUrl: r.cover_url,
      portalSlug: portal.slug,
      town: parsed.town,
    };
    area.shops.push(shop);
    if (r.category && categoryToSlug(r.category)) {
      const list: CityShop[] = area.byCategory.get(r.category) ?? [];
      list.push(shop);
      area.byCategory.set(r.category, list);
    }
    areas.set(key, area);
  }
  return [...areas.values()].sort((a, b) => b.shops.length - a.shops.length || a.key.localeCompare(b.key));
});

/** 店舗のページの題名・説明に入れる「地域」(住所の市区町村)。読み取れなければ null。 */
export function shopCityLabel(address: string | null | undefined): string | null {
  return parseAddress(address)?.city ?? null;
}
