import type { JournalBlock } from "@/lib/journal/posts";

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
                <li key={j}>{item}</li>
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
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
