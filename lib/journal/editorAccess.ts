import { createClient } from "@/lib/supabase/client";

/**
 * いまログインしている人が、記事を書ける人(運営者・投稿担当)かどうか。ブラウザ側で1回だけ確認して使い回す
 * (一覧に記事カードが何十枚あっても、確認は1回)。確認できなければ false。
 */
let cached: Promise<boolean> | null = null;

export function checkJournalEditor(): Promise<boolean> {
  cached ??= (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      const editor = await supabase.rpc("locapass_is_journal_editor" as never);
      return editor.data === true;
    } catch {
      return false;
    }
  })();
  return cached;
}
