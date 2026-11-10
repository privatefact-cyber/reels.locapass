// コンシェルジュAIに渡す「店舗の属性」(ペット同伴可・駐車場など)を、日本語の1行テキストにする。
// 元データ: public.locapass_shop_attributes(行がある=オン。行が無い=「なし」ではなく「未設定」)。
// 表示名・選択肢は lib/verticals/attributes.ts の日本語ラベルと同じにすること(Edge Functionからは
// アプリ側のコードを読めないので、ここに日本語だけ写している。属性を足したらこちらも足す)。
import { createClient } from "jsr:@supabase/supabase-js@2";

type Field =
  | { key: string; kind: "multi" | "single"; label: string; options: Record<string, string>; withLabel?: boolean }
  | { key: string; kind: "flag"; label: string }
  | { key: string; kind: "number"; label: string; unit: string };

const ATTRS: Record<string, { label: string; fields: Field[] }> = {
  cuisine: {
    label: "料理",
    fields: [{ key: "genres", kind: "multi", label: "料理ジャンル", options: { ramen: "ラーメン・つけ麺", sushi: "寿司", tempura: "天ぷら", soba_udon: "そば・うどん", tonkatsu: "とんかつ", unagi: "うなぎ", yakiniku: "焼肉・ステーキ", yakitori: "焼き鳥・串焼き", washoku: "和食・定食", kaiseki: "懐石・会席", seafood: "海鮮・魚料理", nabe: "鍋・しゃぶしゃぶ", okonomiyaki: "お好み焼き・もんじゃ", donburi: "丼もの", curry: "カレー", chinese: "中華", korean: "韓国料理", italian: "イタリアン", french: "フレンチ", western: "洋食", burger: "ハンバーガー", asian: "アジア・エスニック", cafe_sweets: "カフェ・スイーツ", bakery: "パン・ベーカリー", bar: "お酒・バー", other: "その他" } }],
  },
  pet_ok: {
    label: "ペット同伴可",
    fields: [
      { key: "size", kind: "multi", label: "サイズ", options: { small: "小型", medium: "中型", large: "大型" } },
      { key: "max_count", kind: "number", label: "頭数の上限", unit: "頭まで" },
      { key: "vaccine", kind: "single", label: "ワクチン証明", withLabel: true, options: { required: "要", not_required: "不要" } },
      { key: "place", kind: "multi", label: "場所", options: { inside: "店内", terrace: "テラス", partial: "一部" } },
    ],
  },
  pet_only: {
    label: "ペット専用",
    fields: [{ key: "target", kind: "multi", label: "対象", options: { dog: "犬", cat: "猫", other: "その他" } }],
  },
  kids: {
    label: "子連れ歓迎",
    fields: [
      { key: "kids_menu", kind: "flag", label: "キッズメニュー" },
      { key: "stroller", kind: "flag", label: "ベビーカー可" },
      { key: "diaper", kind: "flag", label: "おむつ替え" },
    ],
  },
  barrier_free: {
    label: "バリアフリー",
    fields: [
      { key: "step_free", kind: "flag", label: "段差なし" },
      { key: "wheelchair_toilet", kind: "flag", label: "車いすトイレ" },
    ],
  },
  halal_veg: {
    label: "ハラール・ベジタリアン対応",
    fields: [
      { key: "halal", kind: "single", label: "ハラール", withLabel: true, options: { certified: "認証あり", friendly: "配慮のみ" } },
      { key: "vegetarian", kind: "flag", label: "ベジタリアン" },
      { key: "vegan", kind: "flag", label: "ヴィーガン" },
    ],
  },
  tax_free: { label: "免税", fields: [] },
  languages: {
    label: "外国語対応",
    fields: [{ key: "langs", kind: "multi", label: "言語", options: { en: "英語", zh: "中国語", ko: "韓国語", other: "その他" } }],
  },
  cashless: {
    label: "カード・電子マネー",
    fields: [{ key: "methods", kind: "multi", label: "使えるもの", options: { credit: "クレジット", ic: "交通系IC", qr: "QR決済" } }],
  },
  wifi: { label: "Wi-Fi", fields: [] },
  smoking: {
    label: "喫煙",
    fields: [{ key: "policy", kind: "single", label: "区分", options: { no_smoking: "全席禁煙", separated: "分煙", allowed: "喫煙可" } }],
  },
  parking: {
    label: "駐車場",
    fields: [
      { key: "spaces", kind: "number", label: "台数", unit: "台" },
      { key: "fee", kind: "single", label: "料金", options: { free: "無料", paid: "有料" } },
    ],
  },
};

/** 例: 「ペット同伴可(小型・中型 / 場所: …)」。詳細が無い属性は名前だけ。 */
export function formatAttribute(key: string, detail: unknown): string | null {
  const def = ATTRS[key];
  if (!def) return null;
  const d = detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as Record<string, unknown>) : {};
  const parts: string[] = [];
  for (const f of def.fields) {
    const v = d[f.key];
    if (v === undefined || v === null) continue;
    if (f.kind === "multi" && Array.isArray(v)) {
      const names = v.map((x) => f.options[String(x)]).filter(Boolean);
      if (names.length) parts.push(`${f.label}: ${names.join("・")}`);
    } else if (f.kind === "single" && typeof v === "string" && f.options[v]) {
      parts.push(f.withLabel ? `${f.label}: ${f.options[v]}` : f.options[v]);
    } else if (f.kind === "flag" && v === true) {
      parts.push(f.label);
    } else if (f.kind === "number" && typeof v === "number") {
      parts.push(`${f.label}: ${v}${f.unit}`);
    }
  }
  return parts.length ? `${def.label}(${parts.join(" / ")})` : def.label;
}

/**
 * 全店舗の属性を店舗IDごとにまとめて取る(PostgRESTは1回1000行までなので、ページを分けて読む)。
 * 失敗したら空(属性なしで動く。エラーは握りつぶさずログに出す)。
 */
export async function loadShopAttributeLines(db: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const byShop = new Map<string, string[]>();
  for (let from = 0, page = 0; page < 30; from += 1000, page++) {
    const { data, error } = await db
      .from("locapass_shop_attributes")
      .select("shop_id, attribute_key, detail")
      .order("shop_id")
      .order("attribute_key")
      .range(from, from + 999);
    if (error) {
      console.error("locapass_shop_attributes lookup failed", error);
      break;
    }
    for (const r of (data ?? []) as { shop_id: string; attribute_key: string; detail: unknown }[]) {
      const text = formatAttribute(r.attribute_key, r.detail);
      if (!text) continue;
      const list = byShop.get(r.shop_id) ?? [];
      list.push(text);
      byShop.set(r.shop_id, list);
    }
    if (!data || data.length < 1000) break;
  }
  return new Map([...byShop].map(([id, list]) => [id, list.join("、")]));
}
