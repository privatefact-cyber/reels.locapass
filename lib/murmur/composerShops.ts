import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ComposerShop = { id: string; name: string; iconUrl: string | null };

/**
 * ひとこと一覧の画面に、入力欄を出すための「ログイン中の人が、ひとことを投稿できるお店」。
 * locapass_shop_admins に本人の行がある店舗だけ(店舗のアカウントに紐づく)。未ログイン・該当なしなら空。
 *  - shopId を渡すと、その店だけ(店ごとの一覧ページ用)。
 *  - portalId を渡すと、そのポータルの店だけ。null なら全ポータル(ロカパス全体)。
 *  - システム管理者(運営)は、ロカパス全体の一覧で、運営の公式店舗(LOCAPASS公式)としても投稿できる。
 * 投稿の権限は、投稿時にサーバー側でもう一度確認される(ここは表示の出し分けだけ)。
 */
export async function getComposerShops(opts: { portalId: number | null; shopId?: string }): Promise<ComposerShop[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const admin = createAdminClient() as any;
    const out: ComposerShop[] = [];
    if (opts.portalId == null && !opts.shopId) {
      const { data: isSuper } = await supabase.rpc("locapass_is_super_admin");
      if (isSuper) {
        const { data: official } = await admin.from("locapass_shops").select("id, name, icon_url").eq("slug", "locapass").eq("status", "active").limit(1);
        for (const o of (official ?? []) as { id: string; name: string; icon_url: string | null }[]) out.push({ id: o.id, name: o.name, iconUrl: o.icon_url });
      }
    }
    const { data: links } = await admin.from("locapass_shop_admins").select("shop_id").eq("user_id", user.id).limit(200);
    const ids = ((links ?? []) as { shop_id: string }[]).map((r) => r.shop_id).filter((id) => !opts.shopId || id === opts.shopId);
    if (ids.length === 0) return out;
    let q = admin.from("locapass_shops").select("id, name, icon_url, portal_id").in("id", ids).eq("status", "active").order("name", { ascending: true });
    if (opts.portalId != null) q = q.eq("portal_id", opts.portalId);
    const { data: shops } = await q;
    for (const s of (shops ?? []) as { id: string; name: string; icon_url: string | null }[]) {
      if (!out.some((o) => o.id === s.id)) out.push({ id: s.id, name: s.name, iconUrl: s.icon_url });
    }
    return out;
  } catch {
    return [];
  }
}
