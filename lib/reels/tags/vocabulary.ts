/**
 * リールの自動タグの辞書。DBにはタグID(英字)だけを保存し、表示は言語ごとにここから引く。
 * AIには「この辞書のIDの中から選ぶ」ことだけを許す(自由記述にすると「ラーメン」「らーめん」のように表記が割れて検索できなくなる)。
 * 業種(店舗のカテゴリ)ごとに選べるタグを絞り、的外れなタグ(飲食店に「客室」など)が付かないようにする。
 */
import type { Locale } from "@/lib/i18n/locale";

export type TagGroup = "food" | "shop" | "tour" | "stay" | "pet" | "beauty";

type TagDef = {
  id: string;
  labels: Record<Locale, string>;
  /** どの業種で選べるか。省略=すべての業種。 */
  groups?: TagGroup[];
  /** AIへのヒント(英語)。 */
  hint: string;
};

export const TAG_DEFS: TagDef[] = [
  { id: "interior", labels: { ja: "店内", en: "Interior", zh: "店内", ar: "الداخل" }, hint: "inside the shop or venue, seating, atmosphere" },
  { id: "exterior", labels: { ja: "外観", en: "Exterior", zh: "外观", ar: "الواجهة" }, hint: "the building, entrance, signboard, street view of the shop" },
  { id: "people", labels: { ja: "人物", en: "People", zh: "人物", ar: "أشخاص" }, hint: "a person is the main subject (owner, staff, cast, guest speaking to camera)" },
  { id: "staff", labels: { ja: "スタッフ", en: "Staff", zh: "员工", ar: "الموظفون" }, hint: "staff introduction or staff at work" },
  { id: "event", labels: { ja: "イベント", en: "Event", zh: "活动", ar: "فعالية" }, hint: "an event, festival, live performance, or special occasion" },
  { id: "behind", labels: { ja: "舞台裏", en: "Behind the scenes", zh: "幕后", ar: "خلف الكواليس" }, hint: "preparation, making of, daily work behind the scenes" },
  { id: "campaign", labels: { ja: "お得情報", en: "Deals", zh: "优惠", ar: "عروض" }, hint: "discounts, limited offers, campaigns, announcements of deals" },
  { id: "food", labels: { ja: "料理", en: "Food", zh: "美食", ar: "طعام" }, groups: ["food", "stay"], hint: "dishes and meals" },
  { id: "drink", labels: { ja: "ドリンク", en: "Drinks", zh: "饮品", ar: "مشروبات" }, groups: ["food"], hint: "coffee, alcohol, cocktails, any beverage" },
  { id: "sweets", labels: { ja: "スイーツ", en: "Sweets", zh: "甜品", ar: "حلويات" }, groups: ["food"], hint: "desserts, cakes, pastries, bakery items" },
  { id: "menu", labels: { ja: "メニュー", en: "Menu", zh: "菜单", ar: "القائمة" }, groups: ["food", "beauty"], hint: "a menu board or price list shown" },
  { id: "product", labels: { ja: "商品", en: "Products", zh: "商品", ar: "منتجات" }, groups: ["shop", "beauty"], hint: "items for sale shown up close" },
  { id: "arrival", labels: { ja: "新入荷", en: "New arrivals", zh: "新品", ar: "وصل حديثًا" }, groups: ["shop"], hint: "new stock or new products just arrived" },
  { id: "scenery", labels: { ja: "景色", en: "Scenery", zh: "风景", ar: "مناظر" }, groups: ["tour", "stay"], hint: "landscape, view, scenic spot" },
  { id: "experience", labels: { ja: "体験", en: "Experience", zh: "体验", ar: "تجربة" }, groups: ["tour", "pet", "beauty"], hint: "an activity or hands-on experience in progress" },
  { id: "room", labels: { ja: "客室", en: "Rooms", zh: "客房", ar: "الغرف" }, groups: ["stay"], hint: "guest rooms" },
  { id: "bath", labels: { ja: "お風呂", en: "Bath", zh: "浴场", ar: "الحمام" }, groups: ["stay"], hint: "bath, hot spring, spa facilities" },
  { id: "pet", labels: { ja: "ペット", en: "Pets", zh: "宠物", ar: "حيوانات أليفة" }, groups: ["pet", "food", "stay", "beauty"], hint: "dogs, cats or other pets are the main subject" },
  { id: "treatment", labels: { ja: "施術", en: "Treatment", zh: "护理", ar: "علاج" }, groups: ["beauty"], hint: "a beauty/care treatment being performed" },
  { id: "beforeafter", labels: { ja: "ビフォーアフター", en: "Before & After", zh: "前后对比", ar: "قبل وبعد" }, groups: ["beauty"], hint: "a before/after comparison" },
];

const TAG_BY_ID = new Map(TAG_DEFS.map((t) => [t.id, t]));

export type TagId = string;

export function isTagId(id: unknown): id is TagId {
  return typeof id === "string" && TAG_BY_ID.has(id);
}

export function tagLabel(locale: Locale, id: string): string {
  return TAG_BY_ID.get(id)?.labels[locale] ?? id;
}

/** 店舗のカテゴリ(自由入力の日本語)から業種グループを推定する。分からなければnull(=全タグを選べる)。 */
export function groupOfCategory(category: string | null | undefined): TagGroup | null {
  const c = category ?? "";
  if (/宿泊|ホテル|旅館/.test(c) && !/ペット/.test(c)) return "stay";
  if (/ペット|ドッグ|犬/.test(c)) return "pet";
  if (/カフェ|スイーツ|レストラン|食|居酒屋|バー|ラーメン|焼肉|とんかつ|ベーカリー|料理|フード|飲食/.test(c)) return "food";
  if (/ショッピング|お土産/.test(c)) return "shop";
  if (/観光|体験|遊ぶ/.test(c)) return "tour";
  if (/美容|暮らし|サービス/.test(c)) return "beauty";
  return null;
}

/** その業種で選べるタグ。 */
export function tagsForCategory(category: string | null | undefined): TagDef[] {
  const group = groupOfCategory(category);
  if (!group) return TAG_DEFS;
  return TAG_DEFS.filter((t) => !t.groups || t.groups.includes(group));
}

/** 1リールに付けるタグの最大数。 */
export const MAX_TAGS_PER_REEL = 4;

/** 受け取ったIDの配列を、辞書にあるものだけ・重複なし・最大数までに整える。 */
export function sanitizeTags(input: unknown, allowed?: TagDef[]): string[] {
  if (!Array.isArray(input)) return [];
  const allowedIds = allowed ? new Set(allowed.map((t) => t.id)) : null;
  const out: string[] = [];
  for (const id of input) {
    if (!isTagId(id) || out.includes(id)) continue;
    if (allowedIds && !allowedIds.has(id)) continue;
    out.push(id);
    if (out.length >= MAX_TAGS_PER_REEL) break;
  }
  return out;
}
