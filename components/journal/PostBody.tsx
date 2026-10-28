import type { JournalBlock } from "@/lib/journal/posts";

/** ブログ記事の本文(段落・見出し・箇条書き・補足)を描画する。 */
export function PostBody({ blocks }: { blocks: JournalBlock[] }) {
  return (
    <div className="space-y-4 text-sm leading-7 text-muted">
      {blocks.map((b, i) => {
        if (b.type === "h2") {
          return (
            <h2 key={i} className="pt-4 text-base font-bold text-main">
              {b.text}
            </h2>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "note") {
          return (
            <p key={i} className="rounded-xl border border-main/15 bg-panel-950 px-4 py-3 text-xs leading-6 text-tone-300">
              {b.text}
            </p>
          );
        }
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}
