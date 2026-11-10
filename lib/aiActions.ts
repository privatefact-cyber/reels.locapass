import { ATTRIBUTES, type AttributeField } from "@/lib/verticals/attributes";
import type { Locale } from "@/lib/i18n/locale";

/**
 * コンシェルジュAIの「画面操作」。質問文に料理名が1つだけ出てきたら、その料理の店舗一覧(/tag/cuisine?v=…)への
 * 案内ボタンをAIの回答の下に付ける。さらに「一覧にして・だけ見せて」のような言葉も入っていれば、
 * 回答を出しつつ、画面も先にその一覧へ移動する(AIの提案は必ず出す)。
 * AI(LLM)に画面を自由に触らせない: 動かせるのは「料理で絞った一覧ページへの移動」だけ。
 */

/** 料理の値 → 質問文に出てくる言い方(日本語・英語・中国語)。選択肢の表示名は別に自動で拾う。 */
const CUISINE_SYNONYMS: Record<string, string[]> = {
  ramen: ["ラーメン", "らーめん", "拉麺", "つけ麺", "つけめん", "ramen", "拉面"],
  sushi: ["寿司", "鮨", "すし", "sushi", "寿司"],
  tempura: ["天ぷら", "天麩羅", "tempura", "天妇罗"],
  soba_udon: ["そば", "蕎麦", "うどん", "soba", "udon", "荞麦"],
  tonkatsu: ["とんかつ", "トンカツ", "tonkatsu"],
  unagi: ["うなぎ", "鰻", "ウナギ", "unagi", "鳗鱼"],
  yakiniku: ["焼肉", "焼き肉", "ステーキ", "yakiniku", "steak", "烤肉"],
  yakitori: ["焼き鳥", "焼鳥", "やきとり", "yakitori"],
  seafood: ["海鮮", "seafood", "海鲜"],
  nabe: ["鍋", "しゃぶしゃぶ", "hot pot", "hotpot", "火锅"],
  okonomiyaki: ["お好み焼", "もんじゃ", "たこ焼", "okonomiyaki"],
  curry: ["カレー", "curry", "咖喱"],
  chinese: ["中華", "中国料理", "chinese food", "中餐"],
  korean: ["韓国料理", "korean food", "韩餐"],
  italian: ["イタリアン", "italian", "意大利菜"],
  french: ["フレンチ", "french food", "法餐"],
  burger: ["ハンバーガー", "バーガー", "burger", "汉堡"],
  bakery: ["パン屋", "ベーカリー", "bakery", "面包"],
  cafe_sweets: ["カフェ", "スイーツ", "cafe", "café", "咖啡"],
  bar: ["居酒屋", "izakaya"],
};

/** 「一覧にして・だけ見せて」を表す言い方。「おすすめは?」「探して」のような相談は含めない(AIが答える)。 */
const LIST_INTENT = /(一覧|リスト|だけ|のみ|全部|全て|すべて|まとめて|表示|絞|見せて|見たい|list|show|only|all |列表|全部|只|显示)/iu;

/** explicit: 「一覧にして」系の言葉が入っている(=画面も先に移動する)。false なら案内ボタンだけ付ける。 */
type Result = { href: string; label: Record<Locale, string>; explicit: boolean };

export function detectCuisineAction(text: string): Result | null {
  const lower = text.toLowerCase();
  const field = (ATTRIBUTES.cuisine.fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  if (!field || field.kind !== "multi") return null;
  const hits = field.options.filter((o) => (CUISINE_SYNONYMS[o.value] ?? []).some((w) => lower.includes(w.toLowerCase())));
  // 2つ以上の料理が混ざる質問(「ラーメンと寿司」など)は一覧を1つに決められないので、AIの回答だけにする。
  if (hits.length !== 1) return null;
  return { href: `/tag/cuisine?v=${hits[0].value}`, label: hits[0].label, explicit: LIST_INTENT.test(lower) };
}

/** AIの回答の下に出す、料理の一覧ページへのボタンの文言。 */
export function cuisineButtonLabel(label: string, locale: Locale): string {
  switch (locale) {
    case "en":
      return `See all "${label}" places`;
    case "zh":
      return `查看全部“${label}”店铺`;
    case "ar":
      return `عرض كل أماكن "${label}"`;
    default:
      return `${label}のお店を一覧で見る`;
  }
}
