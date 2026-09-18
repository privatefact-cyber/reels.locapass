import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminScope = {
  id: string;
  email: string | null;
  /** nullならroot admin(全site閲覧・操作可)。配列ならそのsite_idのみに限定されるsite admin。 */
  siteIds: number[] | null;
};

export async function requireAdmin(): Promise<AdminScope> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const [{ data: rootAdmin }, { data: siteAdminRows }] = await Promise.all([
    supabase.from("locapass_root_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("locapass_site_admins").select("site_id").eq("user_id", user.id),
  ]);

  const siteIds = (siteAdminRows ?? []).map((r) => r.site_id);

  if (!rootAdmin && siteIds.length === 0) {
    redirect("/admin/login");
  }

  return {
    id: user.id,
    email: user.email ?? null,
    siteIds: rootAdmin ? null : siteIds,
  };
}

/**
 * 広告投稿・コメント管理・お知らせ配信・アカウント設定はサイト(エリア)を横断する
 * 全体機能のため、site_id限定のサイト管理者には触らせず、root管理者のみに限定する。
 */
export async function requireRootAdmin(): Promise<AdminScope> {
  const scope = await requireAdmin();
  if (scope.siteIds !== null) {
    redirect("/admin");
  }
  return scope;
}
