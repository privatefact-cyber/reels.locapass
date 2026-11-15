/**
 * 店舗AIの「AIを呼ばずに答える」部分(原価0円)。
 *  - 雛形カード(今日の出勤 / 料金システム / 営業時間・アクセス / イベント)と、
 *  - 自由入力でも、短く定番の質問(「料金は?」「電話かけて」「予約して」など)は、文章の判定(ルール)だけで即答する。
 * 答えは、店舗が管理しているライブの情報(DB)と、店舗が確認(OK)した資料から、そのまま整える。
 */

export type QuickKey = "today" | "price" | "access" | "events";

export type FactsData = {
  /** この店舗での、在籍の人の呼び方(キャスト / FACES)。 */
  castLabel: string;
  hours: string;
  openNow: boolean | null;
  place: string;
  phone: string | null;
  priceItems: { name: string; minutes: number | null; price: number }[];
  priceInfo: string;
  usageNotes: string;
  events: { title: string; period: string; body: string }[];
  todayNames: string[];
  castCount: number;
  /** 店舗が確認(OK)した資料。 */
  knowledge: { title: string; text: string }[];
};

/** 質問を、比べやすい形にそろえる(全角半角・大文字小文字・空白・記号)。回答キャッシュの鍵にも使う。 */
export function normalizeQuestion(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[、。,.!?！？~〜…・「」『』()（）\[\]【】"'’”“:：;；\-ー]/g, "")
    .slice(0, 200);
}

/** 「いま」「今日」など、時間で答えが変わる質問は、回答を保存して再利用しない。 */
export function isVolatileQuestion(norm: string): boolean {
  return /(今日|本日|きょう|いま|今|現在|空席|空いて|満席|営業中|開いて|明日|あした|今夜|今晩|tonight|today|now|currently|tomorrow|今天|现在|اليوم)/.test(norm);
}

export type RuleIntent =
  | { kind: "quick"; key: QuickKey }
  | { kind: "nav"; target: "call" | "contact" | "cast" | "reels" }
  | { kind: "greeting" };

/**
 * 短く定番の質問だけを、ルールで見分ける(長い・具体的な質問は、AIに任せる)。
 * 例: 「料金は?」→ 料金システム、「ビールいくら?」→ 具体的なので、ここでは拾わない(AIが資料から答える)。
 */
/** 定番の言葉(これを取り除いて、ほとんど何も残らなければ「定番の質問」とみなす)。 */
const INTENT_WORDS = /(今日|本日|きょう|出勤|在籍|キャスト|faces|女の子|メンバー|スタッフ|料金表|料金|値段|いくら|価格|金額|システム|営業時間|何時|いつまで|定休|休み|場所|住所|アクセス|行き方|最寄|開催中|開催|予定|イベント|キャンペーン|フェア|セミナー|予約|電話|番号|一覧|リスト|リール|動画|hours|openinghours|address|location|where|price|prices|cost|howmuch|events?|reserve|reservation|booking|whoworks|working|today|castlist|call|phone|number)/g;
const FILLER_WORDS = /(は|って|を|が|の|も|です|ですか|ますか|ください|教えて|おしえて|見せて|みせて|出して|だして|見たい|みたい|知りたい|について|まで|何|なに|どこ|ある|あります|か|ね|よ|い|る|た|て|し|と|に|で)/g;
/** 定番の言葉と、つなぎの言葉を除いて、ほとんど残らない(1文字以下)なら、具体的な質問ではなく、定番の質問。 */
function isGeneric(norm: string): boolean {
  return norm.replace(INTENT_WORDS, "").replace(FILLER_WORDS, "").length <= 1;
}

export function detectRule(norm: string): RuleIntent | null {
  const rule = detectRuleLoose(norm);
  if (!rule) return null;
  if (rule.kind === "greeting") return rule;
  // 「ビールいくら?」「初回体験はいくら?」のように、具体的な言葉が混ざる質問は、AIに任せる(資料から答える)。
  return isGeneric(norm) ? rule : null;
}

function detectRuleLoose(norm: string): RuleIntent | null {
  if (norm.length === 0 || norm.length > 14) return null;
  if (/^(こんにちは|こんばんは|おはよう|おはようございます|はじめまして|どうも|やあ|hello|hi|hey|你好|您好|مرحبا)$/.test(norm)) return { kind: "greeting" };
  if (/(電話(かけ|して|したい|番号|をかけ)|callthem|callyou|phonenumber|call$|打电话|拨打|اتصل)/.test(norm)) return { kind: "nav", target: "call" };
  if (/(予約|席をとり|席取|bookatable|reserve|reservation|booking|预约|訂位|حجز)/.test(norm)) return { kind: "nav", target: "contact" };
  if (/(今日|本日|きょう|today).*(出勤|出てる|いる|だれ|誰|faces|キャスト|スタッフ|メンバー)|^出勤(は|状況)?$|whoisworkingtoday|workingtoday/.test(norm)) return { kind: "quick", key: "today" };
  if ((/(在籍|キャスト|faces|女の子|メンバー).*(一覧|リスト|だれ|誰|いる|見せ|出して|みたい|見たい)|^(在籍)?(キャスト|faces)(は|一覧|リスト)?$|^在籍(は|一覧|リスト)?$|whoworks|castlist|allthecast/.test(norm)) && !/(今日|本日|きょう|today)/.test(norm)) return { kind: "nav", target: "cast" };
  if (norm.length <= 8 && /^(リール|動画|reels?|videos?)(を|が)?(見|み|出して|一覧)?/.test(norm)) return { kind: "nav", target: "reels" };
  if (/(イベント|キャンペーン|フェア|セミナー|events?|活动)/.test(norm)) return { kind: "quick", key: "events" };
  if (/(営業時間|何時|いつまで|定休|休み|場所|住所|アクセス|行き方|最寄|hours|openinghours|whenopen|address|location|where|营业|地址|ساعات)/.test(norm)) return { kind: "quick", key: "access" };
  if (/(料金|値段|いくら|価格|金額|システム|料金表|price|prices|cost|howmuch|费用|多少钱|价格|سعر)/.test(norm)) return { kind: "quick", key: "price" };
  return null;
}

const L = {
  ja: {
    today: (label: string) => `本日出勤の${label}`,
    todayNone: (label: string) => `本日の${label}の出勤は、まだ登録されていません。`,
    price: "料金システム",
    priceNone: "料金は、まだ登録されていません。",
    hours: "営業時間",
    open: "いま営業中です",
    closed: "いまは営業時間外です",
    place: "場所",
    phone: "電話",
    accessNone: "営業時間・場所は、まだ登録されていません。",
    events: "開催中・予定のイベント",
    eventsNone: "開催中・予定のイベントは、まだ登録されていません。",
    notes: "ご利用案内",
    greeting: "いらっしゃいませ。このお店のことなら、何でも聞いてください。下のカードからも、すぐ確認できます。",
    people: "人",
    min: "分",
    yen: "円",
  },
  en: {
    today: (label: string) => `${label} working today`,
    todayNone: (label: string) => `No ${label} are registered as working today yet.`,
    price: "Prices",
    priceNone: "Prices are not registered yet.",
    hours: "Hours",
    open: "Open now",
    closed: "Closed right now",
    place: "Location",
    phone: "Phone",
    accessNone: "Hours and location are not registered yet.",
    events: "Current & upcoming events",
    eventsNone: "No current or upcoming events are registered yet.",
    notes: "Notes",
    greeting: "Welcome! Ask me anything about this venue — or tap a card below.",
    people: "",
    min: " min",
    yen: " JPY",
  },
} as const;

const KNOWLEDGE_KEYWORDS: Record<QuickKey, RegExp> = {
  today: /(出勤|シフト|スケジュール)/,
  price: /(料金|価格|メニュー|プラン|システム|VIP|ドリンク|コース|チャージ)/,
  access: /(営業|アクセス|行き方|場所|地図|駐車)/,
  events: /(イベント|キャンペーン|フェア|セミナー)/,
};

const snippet = (t: string, n = 400) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** 雛形カードの答えを、DBと資料から整える。見つからなければ、「まだ登録されていません」と返す。 */
export function buildQuickAnswer(data: FactsData, key: QuickKey, lang: string): string {
  const l = lang === "ja" ? L.ja : L.en;
  const sep = lang === "ja" ? "、" : ", ";
  const lines: string[] = [];
  const related = data.knowledge.filter((k) => KNOWLEDGE_KEYWORDS[key].test(k.title));

  if (key === "today") {
    if (data.todayNames.length === 0) return l.todayNone(data.castLabel);
    lines.push(`${l.today(data.castLabel)}(${data.todayNames.length}${l.people}): ${data.todayNames.join(sep)}`);
  } else if (key === "price") {
    if (data.priceItems.length) {
      lines.push(`【${l.price}】`);
      for (const p of data.priceItems) lines.push(`・${p.name}${p.minutes ? ` ${p.minutes}${l.min}` : ""} ${p.price.toLocaleString("ja-JP")}${l.yen}`);
    }
    if (data.priceInfo) lines.push(data.priceInfo);
    if (data.usageNotes) lines.push(`【${l.notes}】${snippet(data.usageNotes, 300)}`);
  } else if (key === "access") {
    if (data.hours) lines.push(`${l.hours}: ${data.hours}${data.openNow === null ? "" : `(${data.openNow ? l.open : l.closed})`}`);
    if (data.place) lines.push(`${l.place}: ${data.place}`);
    if (data.phone) lines.push(`${l.phone}: ${data.phone}`);
  } else if (data.events.length) {
    lines.push(`【${l.events}】`);
    for (const e of data.events) lines.push(`・${e.title}${e.period ? `(${e.period})` : ""}${e.body ? ` ${snippet(e.body, 120)}` : ""}`);
  }
  for (const k of related.slice(0, 3)) lines.push(`【${k.title}】${snippet(k.text)}`);

  if (lines.length === 0) return key === "price" ? l.priceNone : key === "access" ? l.accessNone : key === "events" ? l.eventsNone : l.todayNone(data.castLabel);
  return lines.join("\n");
}

export const quickGreeting = (lang: string) => (lang === "ja" ? L.ja.greeting : L.en.greeting);
