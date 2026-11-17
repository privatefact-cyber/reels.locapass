/**
 * お店が登録した「予約ページのURL」から、行き先(LINE・Airリザーブなど)を判定して、ボタンの名前にする。
 * 行き先が分かると、押す前に「どこに飛ぶのか」が伝わる(突然、知らないサイトに飛ぶ不安をなくす)。
 * お店が `booking_label` を入れているときは、そちらを優先する(このファイルは、入れていないときの既定)。
 */
export type BookingDestinationKey =
  | "line"
  | "airrsv"
  | "reserva"
  | "hotpepper"
  | "tabelog"
  | "tablecheck"
  | "omakase"
  | "retty"
  | "ikyu"
  | "coubic"
  | "square"
  | "ebica"
  | "google";

const NAMES: Record<BookingDestinationKey, { ja: string; en: string }> = {
  line: { ja: "LINE", en: "LINE" },
  airrsv: { ja: "Airリザーブ", en: "Airreserve" },
  reserva: { ja: "RESERVA", en: "RESERVA" },
  hotpepper: { ja: "ホットペッパー", en: "Hot Pepper" },
  tabelog: { ja: "食べログ", en: "Tabelog" },
  tablecheck: { ja: "TableCheck", en: "TableCheck" },
  omakase: { ja: "OMAKASE", en: "OMAKASE" },
  retty: { ja: "Retty", en: "Retty" },
  ikyu: { ja: "一休.com", en: "Ikyu" },
  coubic: { ja: "Coubic", en: "Coubic" },
  square: { ja: "Square", en: "Square" },
  ebica: { ja: "ebica", en: "ebica" },
  google: { ja: "Google", en: "Google" },
};

/** ドメイン(末尾一致) → 行き先。 */
const HOSTS: [string, BookingDestinationKey][] = [
  ["line.me", "line"],
  ["lin.ee", "line"],
  ["airrsv.net", "airrsv"],
  ["reserva.be", "reserva"],
  ["hotpepper.jp", "hotpepper"],
  ["tabelog.com", "tabelog"],
  ["tablecheck.com", "tablecheck"],
  ["omakase.in", "omakase"],
  ["retty.me", "retty"],
  ["ikyu.com", "ikyu"],
  ["coubic.com", "coubic"],
  ["square.site", "square"],
  ["squareup.com", "square"],
  ["ebica.jp", "ebica"],
  ["reserve.google.com", "google"],
];

export function bookingDestinationKey(url: string | null | undefined): BookingDestinationKey | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, key] of HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return key;
  }
  return null;
}

function isJa(locale: string): boolean {
  return locale === "ja";
}

/** マップの詳細シートなど、幅に余裕があるボタン用: 「LINEで予約」/ "Book on LINE"。 */
export function bookingButtonLabel(key: BookingDestinationKey, locale: string): string {
  const n = NAMES[key];
  return isJa(locale) ? `${n.ja}で予約` : `Book on ${n.en}`;
}

/** 店舗ページの下のナビ用(幅が狭い): 「LINE予約」。名前が長いものは、名前だけ。 */
export function bookingNavLabel(key: BookingDestinationKey, locale: string): string {
  const n = NAMES[key];
  if (!isJa(locale)) return n.en;
  return n.ja.length <= 5 ? `${n.ja}予約` : n.ja;
}
