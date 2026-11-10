import type { Locale } from "@/lib/i18n/locale";
import type { LocapassCategory } from "@/lib/shop/locapassCategories";
import type { AttributeKey } from "@/lib/verticals/attributes";

/**
 * 店舗の「業態」(locapass_shops.business_type。1店に1つ)。業態ごとの違いはここに集める。
 * 業態は「管理画面に出すもの」を決める骨組みで、表示の絞り込み(ポータルの所属など)には使わない。
 * いま持たせているのは表示名・既定の業種・出す属性の3つだけ。業態ごとの専用メニューなどは、
 * 後から BusinessTypeDef に項目を足して広げる。
 * 値を増やすときは、DBのCHECK制約(supabase/migrations/00177)にも足す。
 */
export const BUSINESS_TYPES = ["food", "stay", "beauty", "activity", "leisure", "auto", "retail", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type BusinessTypeDef = {
  /** 表示名(公開サイトの4言語)。店舗管理画面の14言語は、日本語を原本に翻訳カタログで差し替わる。 */
  label: Record<Locale, string>;
  /** 店舗発行時の既定の業種(lib/shop/locapassCategories.ts)。発行後は店舗情報で選び直せる。 */
  category: LocapassCategory;
  /** この業態で店舗管理画面に出す属性(lib/verticals/attributes.ts)。並び順もこのとおり。 */
  attributes: readonly AttributeKey[];
  /** 発行時の業態選択カードに出す絵文字と、ひとこと説明(日本語)。 */
  icon: string;
  description: string;
};

/** すべての業態に出す属性。 */
const COMMON = ["pet_ok", "barrier_free", "languages", "cashless", "parking"] as const satisfies readonly AttributeKey[];

export const VERTICALS: Record<BusinessType, BusinessTypeDef> = {
  food: {
    label: { ja: "飲食", en: "Food & Drink", zh: "餐饮", ar: "طعام وشراب" },
    category: "レストラン・食事",
    attributes: ["cuisine", "pet_ok", "kids", "barrier_free", "halal_veg", "languages", "cashless", "wifi", "smoking", "parking"],
    icon: "🍽️",
    description: "カフェ・レストラン・居酒屋・バーなど",
  },
  stay: {
    label: { ja: "宿泊", en: "Stay", zh: "住宿", ar: "إقامة" },
    category: "宿泊",
    attributes: ["pet_ok", "pet_only", "kids", "barrier_free", "halal_veg", "languages", "cashless", "wifi", "smoking", "parking"],
    icon: "🛏️",
    description: "ホテル・旅館・民宿・ペットホテルなど",
  },
  beauty: {
    label: { ja: "美容・サロン", en: "Beauty & Salon", zh: "美容沙龙", ar: "تجميل وصالونات" },
    category: "美容・暮らし",
    attributes: ["pet_ok", "pet_only", "barrier_free", "languages", "cashless", "parking"],
    icon: "💇",
    description: "美容室・ネイル・エステ・トリミングなど",
  },
  activity: {
    label: { ja: "体験・アクティビティ", en: "Experiences & Activities", zh: "体验活动", ar: "تجارب وأنشطة" },
    category: "観光・体験",
    attributes: ["pet_ok", "kids", "barrier_free", "languages", "cashless", "parking"],
    icon: "🎣",
    description: "体験教室・ツアー・ワークショップなど",
  },
  leisure: {
    label: { ja: "レジャー施設", en: "Leisure Facilities", zh: "休闲设施", ar: "مرافق ترفيهية" },
    category: "観光・体験",
    attributes: ["pet_ok", "pet_only", "kids", "barrier_free", "languages", "cashless", "wifi", "smoking", "parking"],
    icon: "🎡",
    description: "テーマパーク・温浴施設・ドッグランなど",
  },
  auto: {
    label: { ja: "自動車", en: "Automotive", zh: "汽车", ar: "سيارات" },
    category: "その他",
    attributes: COMMON,
    icon: "🚗",
    description: "中古車販売・整備・レンタカーなど",
  },
  retail: {
    label: { ja: "小売・店頭", en: "Retail", zh: "零售", ar: "متاجر" },
    category: "ショッピング",
    attributes: ["pet_ok", "pet_only", "barrier_free", "tax_free", "languages", "cashless", "parking"],
    icon: "🛍️",
    description: "雑貨・お土産・ペット用品・専門店など",
  },
  other: {
    label: { ja: "その他", en: "Other", zh: "其他", ar: "أخرى" },
    category: "その他",
    attributes: COMMON,
    icon: "📍",
    description: "上のどれにも当てはまらない店舗",
  },
};

export function isBusinessType(v: unknown): v is BusinessType {
  return typeof v === "string" && (BUSINESS_TYPES as readonly string[]).includes(v);
}

/** 業態の定義。未設定・不明な値は「その他」として扱う(管理画面に出す属性は、全業態共通のものだけになる)。 */
export function verticalOf(v: string | null | undefined): BusinessTypeDef {
  return isBusinessType(v) ? VERTICALS[v] : VERTICALS.other;
}

export function businessTypeLabel(v: string | null | undefined, locale: Locale = "ja"): string | null {
  return isBusinessType(v) ? VERTICALS[v].label[locale] : null;
}
