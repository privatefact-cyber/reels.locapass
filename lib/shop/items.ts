// 店舗の掲載アイテム(車両の在庫など)の型と表示ヘルパー。管理画面(クライアント)からも読み込むので、サーバー専用の処理(翻訳API等)はここに置かない。
// テーブルは locapass_shop_items(00139, 00140)。
// 車以外(料理・物件など)にも使い回せるよう、業種ごとの項目は attributes に入れる。

import type { Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export const ITEM_STATUSES = ["available", "reserved", "sold", "hidden"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** 管理画面(日本語のみ)用の状態名。公開ページは辞書(t.items.status*)を使う。 */
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  available: "販売中",
  reserved: "商談中",
  sold: "売約済み",
  hidden: "非表示",
};

export type VehicleAttributes = {
  year?: string;
  mileage_km?: number;
  inspection?: string;
  color?: string;
  /** 車検証から読み取る項目(任意)。vin(車台番号)は公開しない。 */
  model_code?: string;
  vin?: string;
  displacement_cc?: number;
  fuel?: string;
  seats?: number;
  body_type?: string;
};

export type ShopItem = {
  id: string;
  shop_id: string;
  kind: string;
  title: string;
  price: number | null;
  price_label: string | null;
  status: ItemStatus;
  description: string | null;
  image_urls: string[];
  attributes: VehicleAttributes;
  display_order: number;
  created_at: string;
  translations?: unknown;
};

export const ITEM_COLUMNS =
  "id, shop_id, kind, title, price, price_label, status, description, image_urls, attributes, display_order, created_at, translations";

/** 翻訳の元になる日本語の項目(店舗が入力した文字だけ。数値は翻訳しない)。 */
export function itemSourceFields(item: Pick<ShopItem, "title" | "description" | "price_label" | "attributes">) {
  return {
    title: item.title,
    description: item.description,
    price_label: item.price_label,
    year: item.attributes?.year,
    inspection: item.attributes?.inspection,
    color: item.attributes?.color,
    fuel: item.attributes?.fuel,
  };
}

/**
 * 価格の表示。ラベル(応談など)があればそれを優先。
 * 日本語は万円で割り切れる額を「255万円」、それ以外は「¥2,555,000」。他の言語は常に「¥2,550,000」。
 */
export function formatItemPrice(item: Pick<ShopItem, "price" | "price_label">, locale: Locale, t: Pick<Dictionary["items"], "priceAsk">): string {
  if (item.price_label) return item.price_label;
  if (item.price == null) return t.priceAsk;
  if (locale === "ja" && item.price >= 10000 && item.price % 10000 === 0) return `${(item.price / 10000).toLocaleString("ja-JP")}万円`;
  return `¥${item.price.toLocaleString("en-US")}`;
}

export function formatMileage(km: number | undefined, locale: Locale): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (locale !== "ja") return `${km.toLocaleString("en-US")} km`;
  return km >= 10000 ? `${(km / 10000).toFixed(km % 10000 === 0 ? 0 : 1)}万km` : `${km.toLocaleString("ja-JP")}km`;
}

/** カードや詳細に並べる車両の仕様(値があるものだけ)。 */
export function vehicleSpecs(a: VehicleAttributes | null | undefined, locale: Locale, t: Pick<Dictionary["items"], "specYear" | "specMileage" | "specInspection" | "specColor" | "specModel" | "specDisplacement" | "specFuel" | "specSeats">): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (!a) return out;
  if (a.year) out.push({ label: t.specYear, value: a.year });
  const m = formatMileage(a.mileage_km, locale);
  if (m) out.push({ label: t.specMileage, value: m });
  if (a.inspection) out.push({ label: t.specInspection, value: a.inspection });
  if (a.color) out.push({ label: t.specColor, value: a.color });
  if (a.model_code) out.push({ label: t.specModel, value: a.model_code });
  if (a.displacement_cc) out.push({ label: t.specDisplacement, value: `${a.displacement_cc.toLocaleString("en-US")} cc` });
  if (a.fuel) out.push({ label: t.specFuel, value: a.fuel });
  if (a.seats) out.push({ label: t.specSeats, value: String(a.seats) });
  return out;
}

/** 公開ページの状態バッジ(販売中は出さない)。 */
export function statusBadge(status: ItemStatus, t: Pick<Dictionary["items"], "statusReserved" | "statusSold">): string | null {
  if (status === "reserved") return t.statusReserved;
  if (status === "sold") return t.statusSold;
  return null;
}

export function itemsPath(portalSlug: string, shopSlug: string): string {
  return `/${portalSlug}/shops/${shopSlug}/items`;
}

export function itemPath(portalSlug: string, shopSlug: string, itemId: string): string {
  return `${itemsPath(portalSlug, shopSlug)}/${itemId}`;
}
