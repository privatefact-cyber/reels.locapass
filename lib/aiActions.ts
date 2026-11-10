import { ATTRIBUTES, type AttributeField } from "@/lib/verticals/attributes";
import type { Locale } from "@/lib/i18n/locale";

/**
 * コンシェルジュAIの「画面操作」。質問文から「〇〇(料理)の一覧を見たい」という意図をその場で見分け、
 * AIの回答を待たずに、その料理の店舗一覧(/tag/cuisine?v=…)へ移動する。
 * AI(LLM)に画面を自由に触らせない: 動かせるのは「料理で絞った一覧ページへの移動」だけ。
 * 料理名と「一覧にして」系の言葉の両方が入っているときだけ動き、どちらか片方なら今までどおりAIが答える。
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

type Result = { href: string; label: Record<Locale, string> };

export function detectListAction(text: string): Result | null {
  const lower = text.toLowerCase();
  if (!LIST_INTENT.test(lower)) return null;
  const field = (ATTRIBUTES.cuisine.fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  if (!field || field.kind !== "multi") return null;
  const hits = field.options.filter((o) => (CUISINE_SYNONYMS[o.value] ?? []).some((w) => lower.includes(w.toLowerCase())));
  // 2つ以上の料理が混ざる質問(「ラーメンと寿司」など)は一覧にできないので、AIに任せる。
  if (hits.length !== 1) return null;
  return { href: `/tag/cuisine?v=${hits[0].value}`, label: hits[0].label };
}

/** チャットに出す、一覧を開いたことの案内。 */
export function listActionMessage(label: string, locale: Locale): { text: string; button: string } {
  switch (locale) {
    case "en":
      return { text: `Opening the list of "${label}" places. Tap the button below if it doesn't open.`, button: `${label} list` };
    case "zh":
      return { text: `正在打开“${label}”店铺列表。如果没有打开，请点击下方按钮。`, button: `${label}店铺列表` };
    case "ar":
      return { text: `جارٍ فتح قائمة "${label}". إذا لم تفتح، اضغط على الزر أدناه.`, button: label };
    default:
      return { text: `「${label}」のお店だけの一覧を開きます。開かないときは下のボタンを押してください。`, button: `${label}のお店一覧を見る` };
  }
}
