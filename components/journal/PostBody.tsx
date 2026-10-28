import Link from "next/link";
import { isSafeLinkUrl, type JournalBlock } from "@/lib/journal/posts";

// 文章の中の [表示する文字](リンク先) を、リンクにする。リンク先は、サイト内のパス(/journal/…)かhttp(s)のURLだけ。
// それ以外(javascript: など)は、リンクにせず、書いたままの文字で出す。
const INLINE_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_LINK)) {
    const [whole, label, url] = m;
    const index = m.index ?? 0;
    if (!isSafeLinkUrl(url)) continue;
    if (index > last) parts.push(text.slice(last, index));
    const cls = "text-hl-200 underline decoration-hl-400/50 underline-offset-4 hover:text-hl-100";
    parts.push(
      url.startsWith("/") ? (
        <Link key={key++} href={url} className={cls}>
          {label}
        </Link>
      ) : (
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className={cls}>
          {label}
        </a>
      ),
    );
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Journal記事の本文(見出し・段落・箇条書き・写真)を、読み物らしくゆったり描画する。 */
export function PostBody({ blocks }: { blocks: JournalBlock[] }) {
  return (
    <div className="space-y-5 text-[15px] leading-8 text-tone-300">
      {blocks.map((b, i) => {
        if (b.type === "h2") {
          return (
            <h2 key={i} className="pt-6 text-lg font-bold leading-snug text-main">
              {b.text}
            </h2>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 marker:text-hl-400/70">
              {b.items.map((item, j) => (
                <li key={j}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "image") {
          return (
            <figure key={i} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.alt} loading="lazy" className="aspect-[3/2] w-full rounded-2xl object-cover" />
              {b.caption ? <figcaption className="text-center text-[11px] text-tone-500">{b.caption}</figcaption> : null}
            </figure>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            <InlineText text={b.text} />
          </p>
        );
      })}
    </div>
  );
}
