import type { Locale } from "@/lib/i18n/locale";

/**
 * 店舗の「属性」(locapass_shop_attributes。1店に複数)。将来AI検索に読ませる構造化データで、
 * 属性で絞り込む検索画面は作らない(地図の🐾スイッチだけは pet_ok / pet_only を使う)。
 * 詳細の入力欄は、翻訳が要らず検索にも使えるよう、できるだけ選択式にしている(自由入力は持たない)。
 *
 * 大事な考え方: 行が無い(チェックなし)は「なし」ではなく「未設定」。公開ページに「不可」とは出さず、
 * オンの属性だけを出す。詳細も同じで、選ばれていない項目は「未設定」として扱う。
 * どの業態にどの属性を出すかは lib/verticals/registry.ts。
 */

type L10n = Record<Locale, string>;

export type AttributeOption = { value: string; label: L10n };

export type AttributeField =
  /** 複数選択(値は選んだ value の配列) */
  | { key: string; kind: "multi"; label: L10n; options: AttributeOption[] }
  /** 1つ選択(値は value の文字列)。withLabel は公開ページで「項目名: 選択肢」と出す(選択肢だけでは意味が通らないもの)。 */
  | { key: string; kind: "single"; label: L10n; options: AttributeOption[]; withLabel?: boolean }
  /** 「あり」のチップ(値は true。外すと未設定に戻る。false は保存しない) */
  | { key: string; kind: "flag"; label: L10n }
  /** 数(値は1以上の整数) */
  | { key: string; kind: "number"; label: L10n; unit: L10n; max: number };

export type AttributeDef = {
  /** true なら、店舗管理画面では選択肢をモーダルのチェックボックスで選ぶ(選択肢が多い属性用)。 */
  modal?: boolean;
  label: L10n;
  /** 公開ページ・管理画面のチップに出す絵文字。 */
  icon: string;
  fields: AttributeField[];
};

const opt = (value: string, ja: string, en: string, zh: string, ar: string): AttributeOption => ({ value, label: { ja, en, zh, ar } });
const l = (ja: string, en: string, zh: string, ar: string): L10n => ({ ja, en, zh, ar });

export const ATTRIBUTES = {
  cuisine: {
    modal: true,
    label: l("料理", "Cuisine", "料理", "المطبخ"),
    icon: "🍜",
    fields: [
      {
        key: "genres",
        kind: "multi",
        label: l("料理ジャンル", "Cuisine", "料理类型", "نوع المطبخ"),
        options: [
          opt("ramen", "ラーメン・つけ麺", "Ramen & tsukemen", "拉面・蘸面", "رامن وتسوكيمن"),
          opt("sushi", "寿司", "Sushi", "寿司", "سوشي"),
          opt("tempura", "天ぷら", "Tempura", "天妇罗", "تمبورا"),
          opt("soba_udon", "そば・うどん", "Soba & udon", "荞麦面・乌冬面", "سوبا وأودون"),
          opt("tonkatsu", "とんかつ", "Tonkatsu", "炸猪排", "تونكاتسو"),
          opt("unagi", "うなぎ", "Eel (unagi)", "鳗鱼", "أنقليس (أوناغي)"),
          opt("yakiniku", "焼肉・ステーキ", "Yakiniku & steak", "烤肉・牛排", "ياكينيكو وستيك"),
          opt("yakitori", "焼き鳥・串焼き", "Yakitori & skewers", "烤鸡肉串", "ياكيتوري وأسياخ"),
          opt("washoku", "和食・定食", "Japanese set meals", "日式料理・定食", "مأكولات يابانية"),
          opt("kaiseki", "懐石・会席", "Kaiseki", "怀石料理", "كايسيكي"),
          opt("seafood", "海鮮・魚料理", "Seafood", "海鲜", "مأكولات بحرية"),
          opt("nabe", "鍋・しゃぶしゃぶ", "Hot pot & shabu-shabu", "火锅・涮涮锅", "هوت بوت وشابو شابو"),
          opt("okonomiyaki", "お好み焼き・もんじゃ", "Okonomiyaki & monja", "大阪烧・文字烧", "أوكونوميياكي ومونجا"),
          opt("donburi", "丼もの", "Rice bowls", "盖饭", "أطباق الأرز (دونبوري)"),
          opt("curry", "カレー", "Curry", "咖喱", "كاري"),
          opt("chinese", "中華", "Chinese", "中餐", "مطبخ صيني"),
          opt("korean", "韓国料理", "Korean", "韩餐", "مطبخ كوري"),
          opt("italian", "イタリアン", "Italian", "意大利菜", "مطبخ إيطالي"),
          opt("french", "フレンチ", "French", "法餐", "مطبخ فرنسي"),
          opt("western", "洋食", "Western-style", "西餐", "مأكولات غربية"),
          opt("burger", "ハンバーガー", "Burgers", "汉堡", "برجر"),
          opt("asian", "アジア・エスニック", "Asian & ethnic", "亚洲・异国料理", "آسيوي وعرقي"),
          opt("cafe_sweets", "カフェ・スイーツ", "Cafe & sweets", "咖啡・甜点", "مقهى وحلويات"),
          opt("bakery", "パン・ベーカリー", "Bakery", "面包", "مخبوزات"),
          opt("bar", "お酒・バー", "Drinks & bar", "酒吧", "مشروبات وبار"),
          opt("other", "その他", "Others", "其他", "أخرى"),
        ],
      },
    ],
  },
  pet_ok: {
    label: l("ペット同伴可", "Pets welcome", "可携带宠物", "يُسمح بالحيوانات الأليفة"),
    icon: "🐾",
    fields: [
      {
        key: "size",
        kind: "multi",
        label: l("サイズ", "Size", "体型", "الحجم"),
        options: [opt("small", "小型", "Small", "小型", "صغير"), opt("medium", "中型", "Medium", "中型", "متوسط"), opt("large", "大型", "Large", "大型", "كبير")],
      },
      { key: "max_count", kind: "number", label: l("頭数の上限", "Max pets", "数量上限", "الحد الأقصى للعدد"), unit: l("頭まで", "max", "只以内", "كحد أقصى"), max: 20 },
      {
        key: "vaccine",
        kind: "single",
        withLabel: true,
        label: l("ワクチン証明", "Vaccination proof", "疫苗证明", "شهادة التطعيم"),
        options: [opt("required", "要", "Required", "需要", "مطلوبة"), opt("not_required", "不要", "Not required", "不需要", "غير مطلوبة")],
      },
      {
        key: "place",
        kind: "multi",
        label: l("場所", "Where", "区域", "المكان"),
        options: [opt("inside", "店内", "Indoors", "店内", "في الداخل"), opt("terrace", "テラス", "Terrace", "露台", "التراس"), opt("partial", "一部", "Some areas", "部分区域", "بعض المناطق")],
      },
    ],
  },
  pet_only: {
    label: l("ペット専用", "For pets", "宠物专用", "مخصص للحيوانات الأليفة"),
    icon: "🐕",
    fields: [
      {
        key: "target",
        kind: "multi",
        label: l("対象", "For", "对象", "لـ"),
        options: [opt("dog", "犬", "Dogs", "狗", "الكلاب"), opt("cat", "猫", "Cats", "猫", "القطط"), opt("other", "その他", "Others", "其他", "أخرى")],
      },
    ],
  },
  kids: {
    label: l("子連れ歓迎", "Kid-friendly", "欢迎带孩子", "مناسب للأطفال"),
    icon: "👶",
    fields: [
      { key: "kids_menu", kind: "flag", label: l("キッズメニュー", "Kids' menu", "儿童菜单", "قائمة للأطفال") },
      { key: "stroller", kind: "flag", label: l("ベビーカー可", "Strollers OK", "可推婴儿车", "عربات الأطفال مسموحة") },
      { key: "diaper", kind: "flag", label: l("おむつ替え", "Changing table", "换尿布台", "مكان لتغيير الحفاضات") },
    ],
  },
  barrier_free: {
    label: l("バリアフリー", "Accessible", "无障碍", "سهل الوصول"),
    icon: "♿",
    fields: [
      { key: "step_free", kind: "flag", label: l("段差なし", "Step-free", "无台阶", "بدون درجات") },
      { key: "wheelchair_toilet", kind: "flag", label: l("車いすトイレ", "Wheelchair toilet", "轮椅卫生间", "دورة مياه للكراسي المتحركة") },
    ],
  },
  halal_veg: {
    label: l("ハラール・ベジタリアン対応", "Halal / Vegetarian", "清真・素食", "حلال / نباتي"),
    icon: "🥗",
    fields: [
      {
        key: "halal",
        kind: "single",
        withLabel: true,
        label: l("ハラール", "Halal", "清真", "حلال"),
        options: [opt("certified", "認証あり", "Certified", "已认证", "معتمد"), opt("friendly", "配慮のみ", "Muslim-friendly", "清真友好", "مراعٍ للمسلمين")],
      },
      { key: "vegetarian", kind: "flag", label: l("ベジタリアン", "Vegetarian", "素食", "نباتي") },
      { key: "vegan", kind: "flag", label: l("ヴィーガン", "Vegan", "纯素", "نباتي صرف") },
    ],
  },
  tax_free: {
    label: l("免税", "Tax-free", "免税", "معفى من الضرائب"),
    icon: "🧾",
    fields: [],
  },
  languages: {
    label: l("外国語対応", "Foreign languages", "外语服务", "لغات أجنبية"),
    icon: "🌐",
    fields: [
      {
        key: "langs",
        kind: "multi",
        label: l("言語", "Languages", "语言", "اللغات"),
        options: [opt("en", "英語", "English", "英语", "الإنجليزية"), opt("zh", "中国語", "Chinese", "中文", "الصينية"), opt("ko", "韓国語", "Korean", "韩语", "الكورية"), opt("other", "その他", "Others", "其他", "أخرى")],
      },
    ],
  },
  cashless: {
    label: l("カード・電子マネー", "Cards & e-money", "刷卡・电子支付", "البطاقات والدفع الإلكتروني"),
    icon: "💳",
    fields: [
      {
        key: "methods",
        kind: "multi",
        label: l("使えるもの", "Accepted", "可用方式", "المقبول"),
        options: [opt("credit", "クレジット", "Credit cards", "信用卡", "بطاقات الائتمان"), opt("ic", "交通系IC", "Transit IC cards", "交通IC卡", "بطاقات IC للمواصلات"), opt("qr", "QR決済", "QR payments", "扫码支付", "الدفع عبر QR")],
      },
    ],
  },
  wifi: {
    label: l("Wi-Fi", "Wi-Fi", "Wi-Fi", "واي فاي"),
    icon: "📶",
    fields: [],
  },
  smoking: {
    label: l("喫煙", "Smoking", "吸烟", "التدخين"),
    icon: "🚭",
    fields: [
      {
        key: "policy",
        kind: "single",
        label: l("区分", "Policy", "规定", "السياسة"),
        options: [opt("no_smoking", "全席禁煙", "Non-smoking", "全面禁烟", "ممنوع التدخين"), opt("separated", "分煙", "Separate smoking area", "分区吸烟", "منطقة تدخين منفصلة"), opt("allowed", "喫煙可", "Smoking allowed", "可吸烟", "التدخين مسموح")],
      },
    ],
  },
  parking: {
    label: l("駐車場", "Parking", "停车场", "موقف سيارات"),
    icon: "🅿️",
    fields: [
      { key: "spaces", kind: "number", label: l("台数", "Spaces", "车位数", "عدد الأماكن"), unit: l("台", "spaces", "个", "أماكن"), max: 9999 },
      {
        key: "fee",
        kind: "single",
        label: l("料金", "Fee", "费用", "الرسوم"),
        options: [opt("free", "無料", "Free", "免费", "مجاني"), opt("paid", "有料", "Paid", "收费", "مدفوع")],
      },
    ],
  },
} as const satisfies Record<string, AttributeDef>;

export type AttributeKey = keyof typeof ATTRIBUTES;
export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES) as AttributeKey[];

/** 地図の🐾スイッチで「ペットと行ける店」とみなす属性。 */
export const PET_ATTRIBUTE_KEYS: readonly AttributeKey[] = ["pet_ok", "pet_only"];

export function isAttributeKey(v: unknown): v is AttributeKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ATTRIBUTES, v);
}

export type AttributeDetail = Record<string, string | string[] | number | true>;

/**
 * 画面や直接送信から来た詳細を、定義にある項目・選択肢だけに絞って整える(知らないキー・値は捨てる)。
 * 空の項目は持たない(=未設定)。
 */
export function sanitizeAttributeDetail(key: AttributeKey, raw: unknown): AttributeDetail {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: AttributeDetail = {};
  for (const f of ATTRIBUTES[key].fields as readonly AttributeField[]) {
    const v = src[f.key];
    if (f.kind === "multi") {
      const allowed = new Set(f.options.map((o) => o.value));
      const list = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.has(x)))] : [];
      if (list.length) out[f.key] = f.options.map((o) => o.value).filter((o) => list.includes(o));
    } else if (f.kind === "single") {
      if (typeof v === "string" && f.options.some((o) => o.value === v)) out[f.key] = v;
    } else if (f.kind === "flag") {
      if (v === true) out[f.key] = true;
    } else {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
      if (Number.isInteger(n) && n >= 1 && n <= f.max) out[f.key] = n;
    }
  }
  return out;
}

/** 公開ページ用の短い説明(例: 「小型・中型 / テラス」)。入っている詳細だけを並べる。 */
export function attributeDetailSummary(key: AttributeKey, detail: unknown, locale: Locale): string[] {
  const d = sanitizeAttributeDetail(key, detail);
  const parts: string[] = [];
  for (const f of ATTRIBUTES[key].fields as readonly AttributeField[]) {
    const v = d[f.key];
    if (v === undefined) continue;
    if (f.kind === "multi" && Array.isArray(v)) {
      parts.push(f.options.filter((o) => v.includes(o.value)).map((o) => o.label[locale]).join(locale === "ja" || locale === "zh" ? "・" : ", "));
    } else if (f.kind === "single") {
      const o = f.options.find((x) => x.value === v);
      if (o) parts.push(f.withLabel ? `${f.label[locale]}: ${o.label[locale]}` : o.label[locale]);
    } else if (f.kind === "flag") {
      parts.push(f.label[locale]);
    } else if (f.kind === "number" && typeof v === "number") {
      parts.push(locale === "ja" || locale === "zh" ? `${v}${f.unit[locale]}` : `${v} ${f.unit[locale]}`);
    }
  }
  return parts;
}
