import { normalizeAddress, toStreetPart } from "@/lib/map/addressGeocode";

/**
 * 動画ストックの取り込みで「すでに登録されている店か」を判定するための純粋関数。
 * (DBやネットワークには触れない。判定の実装は shopIngestion.ts の findExistingShop)
 *
 * 判定の考え方:
 *  - 住所は「番地まで」に揃えて比べる(郵便番号・都道府県・ビル名・階数・全角/半角・丁目表記の違いは無視)。
 *  - 住所が一致し、かつ店名が似ている(または公式サイトのドメインが同じ)なら同じ店とみなす。
 *  - 住所が違えば、店名が同じでも別の支店とみなす。
 */

/** 店名の比較用キー: 全角/半角・大文字小文字・空白・記号の違いを無視する。 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s"'`´・·.,、。!?&+~〜|｜/\\:;()[\]{}<>「」『』【】〈〉《》()-]/g, "")
    .replace(/[‐‑‒–—―−]/g, "");
}

/** 「RePro｜大塚 くせ毛特化美容室」→「RePro」「大塚 くせ毛特化美容室」のように、区切り記号で店名を分ける。 */
export function nameSegments(name: string): string[] {
  return name
    .normalize("NFKC")
    .split(/[|/\\()[\]{}「」『』【】〈〉《》]| [-–—] /)
    .map((s) => s.trim())
    .filter((s) => nameKey(s).length >= 2);
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** 店名が同じ(exact)か、似ている(partial)か、別(null)か。 */
export function matchNames(a: string, b: string): "exact" | "partial" | null {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return null;
  if (ka === kb) return "exact";
  const segA = nameSegments(a).map(nameKey);
  const segB = nameSegments(b).map(nameKey);
  const minLen = (s: string) => (CJK.test(s) ? 2 : 3);
  for (const x of segA) {
    for (const y of segB) {
      if (x === y && x.length >= minLen(x)) return "partial";
    }
  }
  // 片方がもう片方を含む(例:「ASSORT TOKYO」と「ASSORT TOKYO 青山店」)。短すぎる店名での誤判定を避ける。
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (short.length >= 4 && long.includes(short)) return "partial";
  return null;
}

/**
 * 住所の比較用キー(番地まで)。
 * 「〒107-0061 東京都港区北青山2-10-28 リヘイビル B1F」→「港区北青山2-10-28」
 * 住所が空ならnull。
 */
export function addressKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = normalizeAddress(raw.normalize("NFKC"));
  s = s.replace(/^〒?\s*\d{3}-?\d{4}\s*/, "");
  s = toStreetPart(s);
  s = s.replace(/^(?:東京都|北海道|京都府|大阪府|.{2,3}県)/, "");
  s = s.replace(/[\s,、]/g, "").toLowerCase();
  return s || null;
}

/** 番地(数字)まで含む住所キーか。町名だけのキーは、別の店と取り違えやすいので住所一致の根拠にしない。 */
export function hasStreetNumber(key: string | null): key is string {
  return Boolean(key && /\d/.test(key));
}

/** 店舗の公式サイトとして使えないSNS・予約サイト・地図などは、ドメイン一致の根拠にしない。 */
const SHARED_HOSTS = /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|line\.me|lit\.link|linktr\.ee|tabelog\.com|hotpepper\.jp|retty\.me|gnavi\.co\.jp|google\.com|goo\.gl|ameblo\.jp|note\.com|peraichi\.com|jimdofree\.com|wixsite\.com|wordpress\.com|studio\.site|base\.shop|stores\.jp|ekiten\.jp|rakuten\.co\.jp|ozmall\.co\.jp|minimo\.jp|epark\.jp|goope\.jp)$/i;

export function officialHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host && !SHARED_HOSTS.test(host) ? host : null;
  } catch {
    return null;
  }
}

export type ShopRow = { id: string; name: string; address: string | null; url: string | null; status: string; portal_id: number };

/** DBから大まかに拾った候補のうち、同じ店と言えるものだけを残す。 */
export function filterSameShop(rows: ShopRow[], input: { name: string; address?: string | null; officialUrl?: string | null }): ShopRow[] {
  const wantedAddress = addressKey(input.address);
  const wantedHost = officialHost(input.officialUrl);
  return rows.filter((row) => {
    const nameMatch = matchNames(input.name, row.name);
    if (hasStreetNumber(wantedAddress)) {
      if (addressKey(row.address) !== wantedAddress) return false;
      return nameMatch !== null || (wantedHost !== null && officialHost(row.url) === wantedHost);
    }
    // 番地まで分からない候補は、店名が完全に同じ場合だけ(住所の裏付けが無いので厳しめ)。
    return nameMatch === "exact";
  });
}

/** `.or()` に渡す検索語から、PostgRESTの構文を壊す文字を取り除く。 */
export function safeSearchTerm(term: string): string {
  return term.replace(/[%_,()\\"*]/g, " ").replace(/\s+/g, " ").trim();
}

/** 候補を大まかに拾うための検索語(店名の全体・区切りごとの部分・先頭の単語)。 */
export function searchTerms(name: string): string[] {
  const terms = new Set<string>();
  const full = name.normalize("NFKC").trim();
  terms.add(full);
  for (const seg of nameSegments(name)) terms.add(seg);
  const first = full.split(/\s+/)[0] ?? "";
  if (first.length >= (CJK.test(first) ? 2 : 5)) terms.add(first);
  return [...terms].map(safeSearchTerm).filter((t) => t.length >= 2).slice(0, 5);
}
