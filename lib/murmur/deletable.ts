import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MurmurItem } from "@/lib/murmur/queries";

/**
 * 一覧のうち、いまログインしている人が削除できるVOICEのid。投稿した本人と、システム管理者(運営)だけ。
 * (実際の削除のときにも、サーバー側で同じ確認をする。ここは、削除ボタンを出すかどうかの判定。)
 */
export async function getDeletableMurmurIds(items: MurmurItem[]): Promise<string[]> {
  if (items.length === 0) return [];
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: isSuper } = await supabase.rpc("locapass_is_super_admin");
    if (isSuper) return items.map((m) => m.id);
    const { data } = await (createAdminClient() as any)
      .from("locapass_shop_murmurs")
      .select("id")
      .in("id", items.map((m) => m.id))
      .eq("author_user_id", user.id)
      .is("deleted_at", null);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}
