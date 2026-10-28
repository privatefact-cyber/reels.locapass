import { createClient } from "@/lib/supabase/server";

/** いまのログインが、Journalを書ける人(ルート管理者 or 投稿担当)か、ルート管理者かを返す。 */
export async function getJournalAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isEditor: false, isSuper: false };
  const [{ data: isEditor }, { data: isSuper }] = await Promise.all([
    supabase.rpc("locapass_is_journal_editor" as never),
    supabase.rpc("locapass_is_super_admin"),
  ]);
  return { supabase, user, isEditor: isEditor === true, isSuper: isSuper === true };
}
