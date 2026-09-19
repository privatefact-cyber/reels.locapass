import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { geminiGenerateContentUrl } from "@/lib/gemini";

/**
 * 店舗の公式サイトから、紹介文・営業時間・電話番号・料金表・写真の候補を読み取る(サーバー専用)。
 *
 * - 取り込むのは店舗自身が入力したURLのページだけ。結果はそのまま反映せず、店舗が確認してから保存する。
 * - Instagram・X などのSNSは、ログイン必須で各サービスの規約上も自動取得が禁止されているため対象外。
 * - サーバーから任意のURLを取りに行くので、社内ネットワーク等への踏み台にされないよう
 *   プライベートIP・localhost 宛ては弾き、サイズと時間にも上限をかける。
 */

export class ImportError extends Error {}

const SOCIAL_HOSTS = [
  "instagram.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "threads.net",
  "youtube.com",
  "line.me",
];

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const MAX_TEXT_CHARS = 20_000;
const MAX_IMAGE_CANDIDATES = 30;
const MAX_PRICE_ITEMS = 20;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ImportedPriceItem = { name: string; duration_minutes: number | null; price: number };

export type ImportPreview = {
  sourceUrl: string;
  description: string | null;
  business_hours: string | null;
  phone: string | null;
  price_items: ImportedPriceItem[];
  image_urls: string[];
};

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("URLの形式が正しくありません(https:// から入力してください)");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportError("http:// または https:// のURLを入力してください");
  }
  if (url.username || url.password) throw new ImportError("このURLは取り込めません");

  const host = url.hostname.toLowerCase();
  if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new ImportError(
      "Instagram・X などのSNSは、各サービスの規約で内容の自動取得が禁止されているため取り込めません。公式サイトのURLを入力してください。",
    );
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ImportError("このURLは取り込めません");
  }

  let addresses: { address: string }[];
  if (isIP(host)) {
    addresses = [{ address: host }];
  } else {
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      throw new ImportError("サイトが見つかりませんでした。URLをご確認ください");
    }
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ImportError("このURLは取り込めません");
  }
  return url;
}

/** リダイレクトのたびに宛先を検査し直しながら取得する。本文はmaxBytesまでしか読まない。 */
async function guardedFetch(raw: string, accept: string, maxBytes: number) {
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const url = await assertPublicUrl(current);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "LOCAPASS-ShopImporter/1.0 (+https://reels.locapass.net)", Accept: accept },
      });
    } catch {
      throw new ImportError("サイトに接続できませんでした。時間をおいて再度お試しください");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new ImportError("サイトを読み込めませんでした");
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new ImportError(`サイトを読み込めませんでした(${res.status})`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new ImportError("ファイルが大きすぎます");

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new ImportError("ファイルが大きすぎます");
        }
        chunks.push(value);
      }
    }
    return {
      finalUrl: url,
      contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
      body: Buffer.concat(chunks),
    };
  }
  throw new ImportError("リダイレクトが多すぎるため読み込めませんでした");
}

function decodeHtml(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 4096).toString("latin1");
  const charset =
    /charset=([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`,
    "i",
  );
  const m = pattern.exec(html);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() || null : null;
}

function extractPage(html: string, base: URL) {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();
  const metaDescription = metaContent(html, "description") ?? metaContent(html, "og:description");

  const imageSet = new Set<string>();
  const addImage = (src: string | null | undefined) => {
    if (!src || src.startsWith("data:")) return;
    try {
      const abs = new URL(decodeEntities(src.trim()), base);
      if (abs.protocol !== "https:" && abs.protocol !== "http:") return;
      if (/\.(svg|gif|ico)(\?|$)/i.test(abs.pathname)) return;
      imageSet.add(abs.toString());
    } catch {
      // 壊れたURLは無視する
    }
  };
  addImage(metaContent(html, "og:image"));
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    addImage(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i.exec(tag)?.[1]);
    const srcset = /\bsrcset=["']([^"']+)["']/i.exec(tag)?.[1];
    if (srcset) addImage(srcset.split(",").pop()?.trim().split(/\s+/)[0]);
    if (imageSet.size >= MAX_IMAGE_CANDIDATES) break;
  }

  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|dd|dt)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t　]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { title, metaDescription, text, imageCandidates: [...imageSet].slice(0, MAX_IMAGE_CANDIDATES) };
}

async function extractWithGemini(page: ReturnType<typeof extractPage>): Promise<Omit<ImportPreview, "sourceUrl">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ImportError("読み取り機能の設定が未完了です(運営者にお問い合わせください)");

  const prompt = [
    "以下は日本の飲食店・ナイトワーク店舗の公式サイトから抜き出した内容です。",
    "店舗ページに載せる情報を、サイトに書かれている内容だけから抜き出してください。書かれていないことは推測で埋めずnullや空配列にします。",
    "返すJSONの形:",
    '{"description": string|null, "business_hours": string|null, "phone": string|null,',
    ' "price_items": [{"name": string, "duration_minutes": number|null, "price": number}],',
    ' "image_urls": [string]}',
    "ルール:",
    "- description: 店舗の紹介文。サイトの文章をもとに日本語で200文字以内。誇張しない。",
    "- business_hours: 営業時間と定休日を1行で(例: 18:00〜翌5:00／日曜定休)。",
    "- phone: 電話番号(ハイフン区切り)。",
    `- price_items: 金額がはっきり書かれている料金・メニューだけを最大${MAX_PRICE_ITEMS}件。priceは円の整数(税込表記があれば税込)。duration_minutesは「60分」等の時間があるときだけ。`,
    "- image_urls: 候補の中から、店内・外観・料理・ドリンクの写真を良い順に最大8件。ロゴ・アイコン・バナー・地図は除く。候補に無いURLは絶対に返さない。",
    "",
    `ページタイトル: ${page.title}`,
    `メタ説明: ${page.metaDescription ?? ""}`,
    `画像の候補: ${JSON.stringify(page.imageCandidates)}`,
    "本文:",
    page.text,
  ].join("\n");

  const res = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new ImportError("内容の読み取りに失敗しました。時間をおいて再度お試しください");

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
  } catch {
    throw new ImportError("内容の読み取りに失敗しました。時間をおいて再度お試しください");
  }

  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const candidates = new Set(page.imageCandidates);

  const priceItems: ImportedPriceItem[] = Array.isArray(parsed.price_items)
    ? parsed.price_items
        .map((p) => p as Record<string, unknown>)
        .filter((p) => typeof p.name === "string" && Number.isInteger(p.price))
        .map((p) => ({
          name: String(p.name).trim().slice(0, 60),
          duration_minutes:
            Number.isInteger(p.duration_minutes) && (p.duration_minutes as number) > 0
              ? (p.duration_minutes as number)
              : null,
          price: p.price as number,
        }))
        .filter((p) => p.name && p.price > 0 && p.price < 10_000_000)
        .slice(0, MAX_PRICE_ITEMS)
    : [];

  return {
    description: str(parsed.description, 400),
    business_hours: str(parsed.business_hours, 200),
    phone: str(parsed.phone, 30),
    price_items: priceItems,
    image_urls: Array.isArray(parsed.image_urls)
      ? parsed.image_urls.filter((u): u is string => typeof u === "string" && candidates.has(u)).slice(0, 8)
      : [],
  };
}

/** 公式サイトのURLから、取り込み候補を読み取る(DBには何も書かない)。 */
export async function previewShopImport(rawUrl: string): Promise<ImportPreview> {
  const page = await guardedFetch(rawUrl, "text/html,application/xhtml+xml", MAX_PAGE_BYTES);
  if (!page.contentType.includes("html")) throw new ImportError("ホームページ(HTML)のURLを入力してください");
  const extracted = extractPage(decodeHtml(page.body, page.contentType), page.finalUrl);
  if (!extracted.text && extracted.imageCandidates.length === 0) {
    throw new ImportError("ページから内容を読み取れませんでした");
  }
  return { sourceUrl: page.finalUrl.toString(), ...(await extractWithGemini(extracted)) };
}

/** 取り込む写真をサーバー側でダウンロードする(宛先の検査・サイズ上限つき)。 */
export async function downloadImportImage(src: string): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  const res = await guardedFetch(src, "image/jpeg,image/png,image/webp", MAX_IMAGE_BYTES);
  const contentType = res.contentType.split(";")[0].trim();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new ImportError("この形式の画像は取り込めません(JPEG・PNG・WebPのみ)");
  return { bytes: res.body, contentType, ext };
}
