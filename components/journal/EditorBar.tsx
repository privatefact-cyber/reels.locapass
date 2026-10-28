"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * 書ける人(ルート管理者・投稿担当)にだけ、「記事を書く」などの入口を出す。
 * ページ自体は誰にでも同じ(キャッシュできる)ので、ログインの確認は表示のあとに行う。
 * 権限の本当の確認は、書く画面と保存の処理で、サーバーとデータベースが行う。
 */
export function EditorBar({ editSlug }: { editSlug?: string }) {
  const [access, setAccess] = useState<{ editor: boolean; superAdmin: boolean }>({ editor: false, superAdmin: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const [editor, superAdmin] = await Promise.all([
          supabase.rpc("locapass_is_journal_editor" as never),
          supabase.rpc("locapass_is_super_admin"),
        ]);
        if (alive) setAccess({ editor: editor.data === true, superAdmin: superAdmin.data === true });
      } catch {
        // 確認できなければ、何も出さない。
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!access.editor) return null;
  const pill = "rounded-full border border-hl-400/50 px-3 py-1.5 text-xs text-hl-200 transition hover:bg-hl-400/10";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" aria-label="編集メニュー">
      {editSlug ? (
        <Link href={`/journal/${editSlug}/edit`} className={pill}>
          この記事を編集
        </Link>
      ) : null}
      <Link href="/journal/new" className={pill}>
        ＋ 記事を書く
      </Link>
      {access.superAdmin ? (
        <Link href="/journal/editors" className={pill}>
          投稿担当を管理
        </Link>
      ) : null}
    </div>
  );
}
