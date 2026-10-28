/**
 * LOCAPASS Journal(/journal)の記事の型と、本文の書式の変換。日本語のみ。
 * 記事そのものはデータベース(locapass_journal_posts)にあり、ルート管理者と「投稿担当」が画面から書く。
 *   topics … 新機能・お知らせ・開発のこぼれ話
 *   tips   … ちょっとしたコツ
 * 読んでもらうための読み物なので、説明書ではなく、写真つきで、話しかけるような文体で書く。
 * 裏側の仕組みや利用している外部サービス名は、記事には書かない(機能の話だけを書く)。
 */
export type JournalCategory = "tips" | "topics";

export type JournalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "image"; src: string; alt: string; caption?: string };

export type JournalPost = {
  id?: string;
  slug: string;
  category: JournalCategory;
  /** 公開日(JST)。YYYY-MM-DD */
  date: string;
  title: string;
  /** 一覧・検索結果に出す1〜2文の要約 */
  description: string;
  /** 記事の冒頭に大きく出す、導入の一文 */
  lead?: string;
  /** 表紙の写真(URL、または public/ 以下のパス)。無ければ飾りの表紙になる */
  cover?: { src: string; alt: string };
  body: JournalBlock[];
  status?: "draft" | "published";
};

export const JOURNAL_CATEGORY_LABELS: Record<JournalCategory, string> = {
  topics: "新機能・お知らせ",
  tips: "ちょっとしたコツ",
};

/** /journal/<slug> として使えない名前(画面のURLと重なるもの)。 */
export const JOURNAL_RESERVED_SLUGS = ["new", "editors"];
export const JOURNAL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

export function formatJournalDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 写真のURLとして許すもの。サイト内のパス(/journal/…)か、https のURL。 */
export function isSafeImageSrc(src: string): boolean {
  return /^\/[^/\s]/.test(src) || /^https:\/\/[^\s]+$/.test(src);
}

/**
 * 本文の書き方(編集画面のテキスト)  →  ブロックの配列。
 *   ## 見出し       … 見出し
 *   - 項目          … 箇条書き(続けて書くと1つのリスト)
 *   ![説明](URL)    … 写真(説明は写真の下に小さく出る)
 *   空行で区切る    … 段落(同じ段落の中の改行は、そのまま改行になる)
 */
export function parseJournalBody(text: string): JournalBlock[] {
  const blocks: JournalBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "ul", items: list });
    list = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushPara();
      flushList();
      blocks.push({ type: "h2", text: h2[1].trim() });
      continue;
    }
    const img = /^!\[([^\]]*)\]\((\S+)\)$/.exec(line);
    if (img && isSafeImageSrc(img[2])) {
      flushPara();
      flushList();
      const caption = img[1].trim();
      blocks.push({ type: "image", src: img[2], alt: caption || "写真", ...(caption ? { caption } : {}) });
      continue;
    }
    const li = /^-\s+(.+)$/.exec(line);
    if (li) {
      flushPara();
      list.push(li[1].trim());
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

/** ブロックの配列  →  編集画面のテキスト(parseJournalBody の逆)。 */
export function serializeJournalBody(blocks: JournalBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "h2") return `## ${b.text}`;
      if (b.type === "ul") return b.items.map((i) => `- ${i}`).join("\n");
      if (b.type === "image") return `![${b.caption ?? ""}](${b.src})`;
      return b.text;
    })
    .join("\n\n");
}

/** データベースから読んだ本文(JSON)を、安全なブロックの配列に整える。形が違うものは捨てる。 */
export function sanitizeJournalBlocks(value: unknown): JournalBlock[] {
  if (!Array.isArray(value)) return [];
  const out: JournalBlock[] = [];
  for (const b of value) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    if ((o.type === "p" || o.type === "h2") && typeof o.text === "string") {
      out.push({ type: o.type, text: o.text.slice(0, 5000) });
    } else if (o.type === "ul" && Array.isArray(o.items)) {
      const items = o.items.filter((i): i is string => typeof i === "string").map((i) => i.slice(0, 1000));
      if (items.length) out.push({ type: "ul", items });
    } else if (o.type === "image" && typeof o.src === "string" && isSafeImageSrc(o.src)) {
      out.push({
        type: "image",
        src: o.src,
        alt: typeof o.alt === "string" ? o.alt.slice(0, 300) : "写真",
        ...(typeof o.caption === "string" && o.caption ? { caption: o.caption.slice(0, 300) } : {}),
      });
    }
  }
  return out;
}

type PostRow = {
  id: string;
  slug: string;
  category: string;
  title: string;
  description: string;
  lead: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  body: unknown;
  status: string;
  published_on: string;
};

export function rowToJournalPost(r: PostRow): JournalPost {
  return {
    id: r.id,
    slug: r.slug,
    category: r.category === "tips" ? "tips" : "topics",
    date: r.published_on,
    title: r.title,
    description: r.description,
    ...(r.lead ? { lead: r.lead } : {}),
    ...(r.cover_url && isSafeImageSrc(r.cover_url) ? { cover: { src: r.cover_url, alt: r.cover_alt || "" } } : {}),
    body: sanitizeJournalBlocks(r.body),
    status: r.status === "published" ? "published" : "draft",
  };
}
