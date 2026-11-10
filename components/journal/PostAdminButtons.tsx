"use client";

import { useEffect, useState } from "react";
import Link from "@/components/i18n/LocaleLink";
import { Pencil, Trash2 } from "lucide-react";
import { useLocaleRouter } from "@/components/i18n/LocaleProvider";
import { deleteJournalPost } from "@/app/journal/actions";
import { checkJournalEditor } from "@/lib/journal/editorAccess";

/**
 * 記事ごとの「編集」「削除」ボタン。書ける人(運営者・投稿担当)にだけ出す。
 * 記事の一覧の各カードと、記事ページの下に置く。削除は確認のあとに行い、元に戻せない。
 * 権限の本当の確認は、サーバーとデータベースが行う(ここは表示を出すかどうかだけ)。
 */
export function PostAdminButtons({ id, slug, afterDeleteHref, className = "" }: { id?: string; slug: string; afterDeleteHref?: string; className?: string }) {
  const router = useLocaleRouter();
  const [editor, setEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void checkJournalEditor().then((ok) => {
      if (alive) setEditor(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!editor) return null;

  async function remove() {
    if (!id || busy || !window.confirm("この記事を削除しますか? 元に戻せません。")) return;
    setBusy(true);
    setError(null);
    const res = await deleteJournalPost(id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "削除できませんでした。");
      return;
    }
    if (afterDeleteHref) router.push(afterDeleteHref);
    router.refresh();
  }

  const base = "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs transition disabled:opacity-50";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="この記事の編集メニュー">
      <Link href={`/journal/${slug}/edit`} className={`${base} border-hl-400/50 text-hl-200 hover:bg-hl-400/10`}>
        <Pencil size={13} />
        編集
      </Link>
      {id ? (
        <button type="button" disabled={busy} onClick={remove} className={`${base} border-red-400/50 text-red-300 hover:bg-red-400/10`}>
          <Trash2 size={13} />
          {busy ? "削除中…" : "削除"}
        </button>
      ) : null}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
