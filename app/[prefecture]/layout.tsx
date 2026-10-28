import { notFound } from "next/navigation";
import { createStaticClient } from "@/lib/supabase/static";
import { createClient } from "@/lib/supabase/server";

/**
 * 公開前(status が active 以外)のポータルは、ルート管理者かそのポータルの管理者だけが見られる。それ以外の人には404を返す。
 * このディレクトリ名は[prefecture]だが、中身は locapass_portals.slug(例: mito, oarai, caravan)。ポータルではない値
 * (/tokyo/… などのSEO用ルート)は、ポータルの行が無いので、何もせずそのまま通す。
 *
 * 公開中のポータルは、ログインの確認(cookie)をしないので、これまでどおりキャッシュされる。
 * ログインの確認をするのは、公開前のポータルを開いたときだけ。
 */
export default async function PortalGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ prefecture: string }>;
}) {
  const { prefecture } = await params;
  const { data: portal } = await createStaticClient()
    .from("locapass_portals")
    .select("id, status")
    .eq("slug", prefecture)
    .maybeSingle();

  if (portal && portal.status !== "active") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let allowed = false;
    if (user) {
      const [{ data: isSuper }, { data: isPortalAdmin }] = await Promise.all([
        supabase.rpc("locapass_is_super_admin"),
        supabase.rpc("locapass_is_portal_admin", { p_portal_id: portal.id }),
      ]);
      allowed = isSuper === true || isPortalAdmin === true;
    }
    if (!allowed) notFound();
  }

  return <>{children}</>;
}
