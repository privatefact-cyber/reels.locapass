import {
  asStoredTranslations,
  needsTranslation,
  pickTranslation,
  translateFieldsBatch,
  translationSourceHash,
  TRANSLATION_TARGETS,
  type SourceFields,
  type StoredTranslations,
} from "@/lib/i18n/contentTranslation";
import type { Locale } from "@/lib/i18n/locale";
import { JOURNAL_DEFAULT_LINK_LABEL, type JournalBlock, type JournalPost } from "@/lib/journal/posts";
import { journalText } from "@/lib/journal/text";

/**
 * Journal記事の自動翻訳。サーバー専用。
 * 記事の文章を項目ごとのキーに分けて訳し、表示のときに元のブロックの形へ当てはめる。
 *   title / description / lead / link_label / cover_alt … 記事の見出し類
 *   b{i}      … 本文i番目の段落・見出し     b{i}_{j} … i番目の箇条書きのj番目     b{i}_c / b{i}_a … 写真の説明 / 代替文
 */

const DEFAULT_ALT = "写真";
/** 1回のAPI呼び出しで訳す文字数の目安。長い記事は何回かに分けて訳し、1回の応答が長くなりすぎるのを防ぐ。 */
const CHUNK_CHARS = 2500;
const CALLS_PER_BATCH = 3;

type TranslatablePost = Pick<JournalPost, "title" | "description" | "lead" | "cover" | "link" | "body">;

export function journalSourceFields(post: TranslatablePost): SourceFields {
  const f: SourceFields = {
    title: post.title,
    description: post.description,
    lead: post.lead,
    cover_alt: post.cover && post.cover.alt && post.cover.alt !== DEFAULT_ALT ? post.cover.alt : null,
    link_label: post.link && post.link.label && post.link.label !== JOURNAL_DEFAULT_LINK_LABEL ? post.link.label : null,
  };
  post.body.forEach((b, i) => {
    if (b.type === "p" || b.type === "h2") f[`b${i}`] = b.text;
    else if (b.type === "ul") b.items.forEach((item, j) => (f[`b${i}_${j}`] = item));
    else {
      f[`b${i}_c`] = b.caption;
      f[`b${i}_a`] = b.alt && b.alt !== DEFAULT_ALT && b.alt !== b.caption ? b.alt : null;
    }
  });
  return f;
}

export function journalNeedsTranslation(post: TranslatablePost, stored: unknown): boolean {
  return needsTranslation(journalSourceFields(post), stored);
}

/** 項目を、1回の呼び出しで訳す大きさ(文字数)に分ける。見出し類は先頭のかたまりに入る。 */
function chunkFields(fields: SourceFields): SourceFields[] {
  const chunks: SourceFields[] = [];
  let current: SourceFields = {};
  let size = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (!value?.trim()) continue;
    if (size > 0 && size + value.length > CHUNK_CHARS) {
      chunks.push(current);
      current = {};
      size = 0;
    }
    current[key] = value;
    size += value.length;
  }
  if (size > 0) chunks.push(current);
  return chunks;
}

/** 記事を全表示言語へ訳す。失敗した部分が1つでもあれば null(中途半端な翻訳は保存しない)。 */
export async function translateJournalPost(post: TranslatablePost): Promise<StoredTranslations | null> {
  const fields = journalSourceFields(post);
  const chunks = chunkFields(fields);
  const sourceHash = translationSourceHash(fields);
  if (chunks.length === 0) return { source_hash: sourceHash };

  const results: (StoredTranslations | null)[] = [];
  for (let i = 0; i < chunks.length; i += CALLS_PER_BATCH) {
    results.push(...(await translateFieldsBatch(chunks.slice(i, i + CALLS_PER_BATCH))));
  }
  if (results.some((r) => !r)) return null;

  // 原文の言語は先頭のかたまり(見出し・要約・導入)で決める。他のかたまりで言語が違った項目は、翻訳が無く原文のまま出る。
  const merged: StoredTranslations = { source_hash: sourceHash, source_lang: results[0]!.source_lang ?? "ja" };
  for (const target of TRANSLATION_TARGETS) {
    const parts = results.map((r) => r![target]).filter((p): p is Record<string, string> => !!p);
    if (parts.length) merged[target] = Object.assign({}, ...parts);
  }
  return merged;
}

/** 表示言語に合わせて、翻訳がある項目を差し替えた記事を返す(翻訳が無い項目・原文と同じ言語の項目は原文のまま)。 */
export function localizeJournalPost(post: JournalPost, locale: Locale): JournalPost {
  const stored = asStoredTranslations(post.translations);
  const sourceLang = stored.source_lang ?? "ja";
  const t = journalText(locale);
  // 日本語で保存される既定の文言(ボタンの「詳しくはこちら」・写真の代替文「写真」)は、どの記事でも表示言語に合わせる。
  const withDefaults = (p: JournalPost): JournalPost => ({
    ...p,
    ...(p.cover && (!p.cover.alt || p.cover.alt === DEFAULT_ALT) ? { cover: { ...p.cover, alt: t.photo } } : {}),
    ...(p.link && p.link.label === JOURNAL_DEFAULT_LINK_LABEL ? { link: { ...p.link, label: t.defaultLinkLabel } } : {}),
    body: p.body.map((b) => (b.type === "image" && b.alt === DEFAULT_ALT ? { ...b, alt: t.photo } : b)),
  });
  if (locale === sourceLang) return withDefaults(post);
  // 記事が書き換えられて翻訳が古い間は、本文のブロックの位置がずれているかもしれないので、翻訳を使わず原文を出す。
  if (stored.source_hash !== translationSourceHash(journalSourceFields(post))) return withDefaults(post);

  const pick = (original: string | null | undefined, key: string) => pickTranslation(locale, original ?? null, stored, key).text ?? original ?? "";
  const body: JournalBlock[] = post.body.map((b, i): JournalBlock => {
    if (b.type === "p" || b.type === "h2") return { ...b, text: pick(b.text, `b${i}`) };
    if (b.type === "ul") return { ...b, items: b.items.map((item, j) => pick(item, `b${i}_${j}`)) };
    const caption = b.caption ? pick(b.caption, `b${i}_c`) : undefined;
    const alt = b.alt === DEFAULT_ALT ? b.alt : pick(b.alt, `b${i}_a`) || caption || b.alt;
    return { ...b, alt, ...(caption ? { caption } : {}) };
  });

  return withDefaults({
    ...post,
    title: pick(post.title, "title"),
    description: pick(post.description, "description"),
    ...(post.lead ? { lead: pick(post.lead, "lead") } : {}),
    ...(post.cover ? { cover: { ...post.cover, alt: post.cover.alt === DEFAULT_ALT || !post.cover.alt ? post.cover.alt : pick(post.cover.alt, "cover_alt") } } : {}),
    ...(post.link
      ? { link: { ...post.link, label: post.link.label === JOURNAL_DEFAULT_LINK_LABEL ? post.link.label : pick(post.link.label, "link_label") } }
      : {}),
    body,
  });
}
