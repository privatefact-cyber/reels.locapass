/**
 * リールの紹介文(キャプション・検索結果の説明文)を、店名・エリア・ジャンル(料理)から組み立てる。
 * 外部のAIは使わない(正規表現とテンプレートだけ。1件あたり1ミリ秒未満)。
 *
 * 使いどころ:
 *   1. 収集した外部動画 … 「YouTubeで紹介された 店名 #タグ #タグ」のような生ログ表記を、自然な紹介文にする
 *   2. 店舗が投稿するリール・写真 … 文章が空のときに、店の情報から紹介文を補う(書かれた文章は変えない)
 *   3. スナップ写真 … 検索結果の説明文が空のときに補う
 * 同じ言い回しばかりにならないよう、5種類のテンプレートを、動画ID等の文字列から決まった順に振り分ける
 * (同じ動画には毎回同じ文が出る=ページの内容が揺れない)。
 */

/** 収集した動画に付いていた、出所を示す定型の書き出し。 */
const SOURCE_PREFIX = /^\s*(?:YouTube|TikTok|Instagram)で紹介された[\s　]*/u;

/** 自動収集で付いた生ログ表記を含むかどうか(行のどこかが出所の書き出しで始まる)。店舗が自分で書いた文章は対象にしない。 */
export function isAutoCaption(raw: string | null | undefined): boolean {
  return !!raw && raw.split("\n").some((line) => SOURCE_PREFIX.test(line));
}

const HASHTAG = /[#＃][^\s#＃]+/gu;
const URL_RE = /https?:\/\/\S+/gu;

/** メニュー名・料理名として紹介文に使わないハッシュタグ(エリア名・一般語・投稿用の決まり文句)。 */
const GENERIC_TAG =
  /(グルメ|ランチ|ディナー|モーニング|おすすめ|オススメ|人気|vlog|shorts?|fyp|reels?|tiktok|youtube|旅行|観光|デート|散歩|飯テロ|まとめ|東京|大阪|京都|名古屋|福岡|北海道|横浜|神奈川|埼玉|千葉|茨城|栃木|群馬|渋谷|新宿|池袋|銀座|原宿|表参道|恵比寿|中目黒|上野|浅草|水戸|大洗|[都道府県市区町村]$|asmr|japan|tokyo|food|foodie|美容室|ヘアサロン|サロン|カフェ巡り|店舗|公式)/iu;

/** 文章に残っていたハッシュタグを取り出す(#は外す)。重複は除く。 */
export function extractHashtags(raw: string): string[] {
  const seen = new Set<string>();
  for (const m of raw.matchAll(HASHTAG)) {
    const tag = m[0].replace(/^[#＃]/u, "").trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/**
 * 自動収集の生ログ表記から、出所の書き出し・ハッシュタグ・URLを取り除いた文章を返す。
 * 残りが短すぎる(タイトルがほぼハッシュタグだけ等)ときは空文字。
 */
export function cleanAutoCaption(raw: string): string {
  const text = raw
    .replace(SOURCE_PREFIX, "")
    .replace(URL_RE, "")
    .replace(HASHTAG, "")
    .replace(/[ \t　]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
  return text.length >= 12 ? text : "";
}

/** 住所から、紹介文に使う「エリア」(都道府県+市区町村+町名まで。番地は除く)を取り出す。取れなければnull。 */
export function areaFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const cleaned = address
    .replace(/〒?\s*\d{3}-?\d{4}\s*/u, "")
    .replace(/^日本[、,\s]*/u, "")
    .replace(/[０-９]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
  const m = cleaned.match(/^(.*?[都道府県])?(.*?[市区町村郡])(.*?)(?=[0-9\-ー－丁番号\s]|$)/u);
  if (!m) return null;
  const area = `${m[1] ?? ""}${m[2]}${m[3] ?? ""}`.trim();
  return area.length >= 2 && area.length <= 18 ? area : null;
}

/** 住所から、市区町村(「大田区」)と町名(「蒲田」)を別々に取り出す。取れなければnull。 */
export function areaPartsFromAddress(address: string | null | undefined): { city: string | null; town: string | null } {
  if (!address) return { city: null, town: null };
  const cleaned = address
    .replace(/〒?\s*\d{3}-?\d{4}\s*/u, "")
    .replace(/^日本[、,\s]*/u, "")
    .replace(/[０-９]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
  const m = cleaned.match(/^(?:.*?[都道府県])?(.*?[市区町村郡])(.*?)(?=[0-9\-ー－丁番号\s]|$)/u);
  if (!m) return { city: null, town: null };
  const city = m[1].trim();
  const town = (m[2] ?? "").trim();
  return {
    city: city.length >= 2 && city.length <= 8 ? city : null,
    town: town.length >= 2 && town.length <= 8 ? town : null,
  };
}

type Flavor = { noun: string; spot: string; thing: string };

/** 店舗の業種(カテゴリ)ごとの言い回し。 */
function flavorForCategory(category: string | null | undefined): Flavor {
  const c = category ?? "";
  if (/カフェ|スイーツ|喫茶/u.test(c)) return { noun: "カフェ", spot: "カフェ", thing: "メニュー" };
  if (/居酒屋|バー|酒/u.test(c)) return { noun: "居酒屋・バー", spot: "お酒が楽しめるお店", thing: "お酒とお料理" };
  if (/レストラン|食事|グルメ|飲食/u.test(c)) return { noun: "グルメ", spot: "飲食店", thing: "料理" };
  if (/美容|サロン|ヘア|ネイル|エステ|暮らし/u.test(c)) return { noun: "美容", spot: "美容サロン", thing: "サービス" };
  if (/宿泊|ホテル|旅館/u.test(c)) return { noun: "宿泊", spot: "宿泊施設", thing: "お部屋" };
  if (/観光|体験/u.test(c)) return { noun: "おでかけ", spot: "おでかけスポット", thing: "体験" };
  return { noun: "お店", spot: "お店", thing: "魅力" };
}

/** 料理名(「ラーメン・つけ麺」など)から、文に入れやすい短い呼び方を作る。 */
function flavorForCuisine(cuisine: string): Flavor {
  const short = cuisine.split("・")[0];
  return { noun: short, spot: `${short}のお店`, thing: "料理" };
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 似た文字列(p0, p1, p2…)でも下位ビットが偏らないよう、最後に混ぜる。
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export type IntroInput = {
  shopName: string | null | undefined;
  /** 住所(エリアは、ここから取り出す) */
  address?: string | null;
  /** 店舗の業種(「カフェ・スイーツ」など) */
  category?: string | null;
  /** 店舗が選んだ料理(「ラーメン・つけ麺」など)。あれば業種より優先して言い回しに使う */
  cuisines?: readonly string[];
  /** 名物・メニューとして使えそうな語(ハッシュタグ由来など)。一般語・エリア名は自動で除く */
  menuHints?: readonly string[];
  /** テンプレートを決める文字列(動画ID・リールIDなど)。同じ値なら必ず同じ文になる */
  seed: string;
};

/** 食べ物・飲み物らしい語(メニュー名として優先する)。 */
const FOOD_WORD = /(ラーメン|らーめん|麺|寿司|丼|カレー|ケーキ|ベーカリー|クロワッサン|サンドイッチ|珈琲|コーヒー|紅茶|かき氷|パフェ|ピザ|パスタ|焼肉|焼き鳥|天ぷら|うどん|蕎麦|餃子|唐揚|ハンバーグ|ステーキ|スイーツ|プリン|タルト|ドーナツ|クレープ|アイス|ランチセット|モーニング|アフタヌーンティー)/u;

/** 美容・体験などのサービス名として使える語。 */
const SERVICE_WORD = /(髪質改善|ヘッドスパ|カット|カラー|パーマ|縮毛矯正|トリートメント|ネイル|まつげ|マッサージ|エステ|脱毛|ヨガ|ピラティス|整体)/u;

/**
 * 動画のタイトル・説明文から、紹介文に使えるメニュー語の候補を集める(ハッシュタグ+文中の食べ物の語)。
 * 並びは「ハッシュタグ → 文中の語」。使えるかどうかは composeIntro が決める。
 */
export function menuHintsFromText(text: string): string[] {
  const tags = extractHashtags(text);
  const body = text.replace(HASHTAG, " ");
  const words = [...body.matchAll(new RegExp(FOOD_WORD.source, "gu"))].map((m) => m[0]);
  return [...new Set([...tags, ...words])];
}

/** 住所から、市区町村の名前(「狛江」「大田」など。市区町村の字は除く)を取り出す。ハッシュタグの地名を見分けるのに使う。 */
function areaTokens(address: string | null | undefined): string[] {
  if (!address) return [];
  const rest = address.replace(/^[^都道府県\d]*[都道府県]/u, "");
  return [...rest.matchAll(/([一-龥ぁ-んァ-ヶー]{1,6}?)[市区町村]/gu)].map((m) => m[1]).filter((t) => t.length >= 2);
}

/**
 * 紹介文に使えるメニュー語を1つ選ぶ。エリア名・一般語・店名と同じ語・英数字だけの語・長すぎる語は使わない。
 * 食べ物らしい語(ラーメン・寿司など)があればそれを優先し、無いときは短い語だけを使う。
 */
function pickMenu(hints: readonly string[] | undefined, shopName: string, noun: string, address: string | null | undefined): string | null {
  const tokens = areaTokens(address);
  const candidates: string[] = [];
  for (const raw of hints ?? []) {
    const tag = raw.trim();
    if (tag.length < 2 || tag.length > 14) continue;
    if (/^[\x00-\x7F]+$/u.test(tag)) continue; // 英数字だけのタグ(yoga, howto など)は使わない
    if (GENERIC_TAG.test(tag)) continue;
    if (shopName.includes(tag) || tag.includes(shopName)) continue;
    if (tag === noun) continue;
    if (tokens.some((t) => tag.startsWith(t))) continue; // 「狛江らーめん」のような地名つきのタグ
    if (address && address.includes(tag)) continue;
    candidates.push(tag);
  }
  // 使うのは、食べ物・サービスらしい語だけ(「1人飲み」「ギャル」のような語は、紹介文として不自然になるので使わない)。
  return candidates.find((t) => !t.startsWith("脱") && (FOOD_WORD.test(t) || SERVICE_WORD.test(t))) ?? null;
}

/** 店舗の情報から、紹介文を1つ作る(5種類のテンプレートのうち、seedで決まった1つ)。店名が無ければnull。 */
export function composeIntro(input: IntroInput): string | null {
  const name = input.shopName?.trim();
  if (!name) return null;
  const area = areaFromAddress(input.address);
  const cuisine = input.cuisines?.find((c) => c.trim());
  const flavor = cuisine ? flavorForCuisine(cuisine) : flavorForCategory(input.category);
  const menu = pickMenu(input.menuHints, name, flavor.noun, input.address);
  const A = area;
  const M = menu;
  const { noun, spot, thing } = flavor;
  // 「名物」は食べ物・飲み物だけ。美容・宿泊などのサービス名には「人気の」を使う。
  const lead = /料理|メニュー|お酒/u.test(thing) ? "名物の" : "人気の";

  const patterns: string[] = [
    // 1: 場所 → 店名 → 名物
    `${A ? `${A}にある` : ""}「${name}」。${M ? `${lead}${M}をはじめ、` : ""}お店の雰囲気と自慢の${thing}をショート動画でチェック。`,
    // 2: 【場所】店名の○○
    `${A ? `【${A}】` : ""}${name}${M ? `の${M}` : `(${noun})`}。${thing}の魅力を動画でお届け。`,
    // 3: 店名(場所)
    `${name}${A ? `(${A})` : ""}。${M ? `人気の${M}など、` : ""}お店の雰囲気と${thing}がひと目でわかるショートムービー。`,
    // 4: 探している人向け
    `${A ? `${A}で` : ""}${noun}を探すなら「${name}」。${M ? `${M}が気になる方は、` : ""}まずは動画で雰囲気をチェックしてみてください。`,
    // 5: 紹介
    `「${name}」は${A ? `${A}の` : ""}${spot}。${M ? `${M}など、` : ""}動画で店内の様子や${thing}を紹介します。`,
  ];
  const text = patterns[fnv1a(`${input.seed}|${name}`) % patterns.length];
  return text.slice(0, 140);
}

/** スナップ写真(ユーザーが街で撮った写真)の、検索結果用の説明文。コメントが無いときだけ使う。 */
export function composePhotoIntro(input: { spotName: string | null | undefined; address?: string | null; seed: string }): string | null {
  const spot = input.spotName?.trim();
  if (!spot) return null;
  const area = areaFromAddress(input.address);
  const patterns = [
    `${area ? `${area}の` : ""}「${spot}」で撮影された写真。街歩きの途中で見つけた、お店や景色の雰囲気をチェック。`,
    `${spot}${area ? `(${area})` : ""}のスナップ写真。実際に訪れた人の目線で、現地の様子がわかります。`,
    `${area ? `【${area}】` : ""}${spot}。LOCAPASSのユーザーが撮った、街のリアルな一枚。`,
  ];
  return patterns[fnv1a(`${input.seed}|${spot}`) % patterns.length].slice(0, 140);
}

export type ReelCaptionInput = IntroInput & {
  /** 保存されている投稿文(自動収集の生ログ・店舗が書いた文章・空 のどれでも) */
  raw: string | null | undefined;
};

/**
 * 画面・検索結果に出す紹介文を決める。
 *  - 店舗が自分で書いた文章 … そのまま(変えない)
 *  - 自動収集の文章 … 「YouTubeで紹介された…」の行(生ログ)は外す。それ以外にAIの要約が十分な長さで残っていればそれを使い、
 *    無ければ店の情報(店名・エリア・料理)から組み立てる
 *  - 空 … 店の情報から組み立てる
 */
export function reelCaptionFor(input: ReelCaptionInput): string | null {
  const raw = input.raw?.trim() ?? "";
  if (raw && !isAutoCaption(raw)) return raw;
  if (!raw) return composeIntro(input);
  const lines = raw.split("\n");
  const junk = lines.filter((line) => SOURCE_PREFIX.test(line)).join(" ");
  const summary = cleanAutoCaption(lines.filter((line) => !SOURCE_PREFIX.test(line)).join("\n"));
  if (summary.length >= 20) return summary;
  const hints = [...(input.menuHints ?? []), ...menuHintsFromText(junk)];
  // 動画のタイトルをそのまま出しても紹介文にならないので、店の情報から組み立てる。店名が分からないときだけ整えたタイトルを使う。
  return composeIntro({ ...input, menuHints: hints }) ?? (cleanAutoCaption(junk) || null);
}

export type TagLocale = "ja" | "en" | "zh" | "ar";

export type TagInput = {
  /** 店名(スナップ写真ではスポット名) */
  shopName?: string | null;
  address?: string | null;
  /** 英語の住所(ローマ字)。日本語以外の画面で、エリアのタグをローマ字にするのに使う。無ければ、英語・アラビア語ではエリアのタグを付けない */
  addressEn?: string | null;
  /** 店舗の業種(「カフェ・スイーツ」など) */
  category?: string | null;
  /** 店舗が選んだ料理(「ラーメン・つけ麺」など)。あれば業種より優先 */
  cuisines?: readonly string[];
  /** 表示する言語。省略は日本語 */
  locale?: TagLocale;
};

/** 店名からタグにする語を作る(かっこの中身・記号・空白を外す)。長すぎる・短すぎるときはnull。 */
function shopNameTag(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/[\s　|｜/／・,、。!！?？#＃"'「」『』【】[\]<>]+/gu, "")
    .trim();
  return base.length >= 2 && base.length <= 16 ? base : null;
}

const ROMAN_WORD = /^[A-Za-z][A-Za-z' .-]*$/;
const EN_SUFFIX = /[- ](?:shi|ku|cho|machi|gun|mura|city|ward|town|village)$/i;

/** ローマ字の語を、ハッシュタグにできる形にする(「Taito-ku」「Tsukuba City」→「Taito」「Tsukuba」)。 */
function romanTag(segment: string | undefined): string | null {
  const raw = segment?.replace(/^[\d\s-]+/, "").trim();
  if (!raw || !ROMAN_WORD.test(raw)) return null;
  const t = raw.replace(EN_SUFFIX, "").replace(/[\s'.-]+/g, "");
  return t.length >= 2 && t.length <= 20 ? t : null;
}

/**
 * 英語の住所(「…, 3-1 Higashiueno, Taito-ku, Tokyo」)から、市区町村と町名のローマ字を取り出す。
 * 最後は都道府県なので除き、区の前の語を町名にする(「Totsuka-ku, Yokohama」のように市が区の後ろに来るときは、区の前を町名にする)。取れなければnull。
 */
export function areaPartsFromEnglish(addressEn: string | null | undefined): { city: string | null; town: string | null } {
  if (!addressEn) return { city: null, town: null };
  const segs = addressEn.split(",").map((x) => x.trim()).filter(Boolean);
  if (segs.length < 3) return { city: null, town: null };
  const rest = segs.slice(0, -1); // 都道府県を除く
  const last = rest[rest.length - 1];
  const prev = rest[rest.length - 2];
  const wardThenCity = /-ku$/i.test(prev ?? "") && !/-ku$/i.test(last);
  const city = romanTag(last);
  const town = romanTag(wardThenCity ? rest[rest.length - 3] : prev);
  return { city, town: town && town !== city ? town : null };
}

/** タグに使う、業種の言い回し(日本語は flavorForCategory の noun)。 */
const NOUN_TAG: Record<string, Partial<Record<TagLocale, string>>> = {
  カフェ: { en: "Cafe", zh: "咖啡馆", ar: "مقهى" },
  "居酒屋・バー": { en: "Izakaya", zh: "居酒屋", ar: "إيزاكايا" },
  グルメ: { en: "Gourmet", zh: "美食", ar: "مأكولات" },
  美容: { en: "Beauty", zh: "美容", ar: "جمال" },
  宿泊: { en: "Lodging", zh: "住宿", ar: "إقامة" },
  おでかけ: { en: "Sightseeing", zh: "观光", ar: "سياحة" },
};

/** 料理の語(「ラーメン」など)の、言語ごとのタグ。無い語はnull(日本語のまま出さない)。 */
const CUISINE_TAG: Record<string, Partial<Record<TagLocale, string>>> = {
  ラーメン: { en: "Ramen", zh: "拉面", ar: "رامن" },
  つけ麺: { en: "Tsukemen", zh: "蘸面", ar: "تسوكيمن" },
  寿司: { en: "Sushi", zh: "寿司", ar: "سوشي" },
  焼肉: { en: "Yakiniku", zh: "烤肉", ar: "ياكينيكو" },
  とんかつ: { en: "Tonkatsu", zh: "炸猪排", ar: "تونكاتسو" },
  海鮮料理: { en: "Seafood", zh: "海鲜", ar: "مأكولات بحرية" },
  ベーカリー: { en: "Bakery", zh: "面包店", ar: "مخبز" },
};

/** 文末に付けるタグ(店名・市区町村・町名・料理/業種)。#は付けない。最大5つ。日本語以外では、エリアはローマ字(中国語は漢字のまま)、業種・料理は言語に合わせる。 */
export function composeTags(input: TagInput): string[] {
  const locale = input.locale ?? "ja";
  const out: string[] = [];
  const add = (w: string | null | undefined) => {
    const t = w?.trim();
    if (!t || t.length < 2) return;
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  add(shopNameTag(input.shopName));
  // エリア: 日本語・中国語は住所の漢字(中国語の読者は読める)。英語・アラビア語はローマ字の住所から(無ければ付けない)。
  const area = locale === "ja" || locale === "zh" ? areaPartsFromAddress(input.address) : areaPartsFromEnglish(input.addressEn);
  add(area.city);
  add(area.town);
  const before = out.length;
  const cuisine = input.cuisines?.find((c) => c.trim());
  if (cuisine) {
    for (const part of cuisine.split("・").slice(0, 2)) add(locale === "ja" ? part : CUISINE_TAG[part]?.[locale]);
  }
  // 料理が無い(または、その言語の言い回しが無い)ときは、業種で補う。
  if (out.length === before && !(cuisine && locale === "ja")) {
    const noun = flavorForCategory(input.category).noun;
    if (noun !== "お店") add(locale === "ja" ? noun : NOUN_TAG[noun]?.[locale]);
  }
  return out.slice(0, 5);
}

/** 文の末尾に「#店名 #エリア #料理」を足す。文に既に同じタグがあれば足さない。文が空ならタグだけを返す。 */
export function appendTags(text: string | null | undefined, input: TagInput): string | null {
  const body = text?.trim() ?? "";
  const tagSet = new Set((body.match(/[#＃][^\s#＃]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()));
  const tags = composeTags(input).filter((t) => !tagSet.has(t.toLowerCase()));
  if (tags.length === 0) return body || null;
  const line = tags.map((t) => `#${t}`).join(" ");
  return body ? `${body}\n${line}` : line;
}

/** 文末のタグの行(#で始まる行)を外した本文。検索結果の説明文など、タグを入れたくないところで使う。 */
export function stripTagLine(text: string | null | undefined): string {
  return (text ?? "")
    .split("\n")
    .filter((line) => !/^\s*[#＃]/u.test(line))
    .join("\n")
    .trim();
}
