import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccountName } from "@/lib/gbp/client";

/** リンク行に保存済みのアカウントを返す。無ければGoogleに問い合わせて探し、保存する。 */
export async function ensureAccountName(link: { shop_id: string; gbp_location_id: string; gbp_account_id: string | null }): Promise<string> {
  if (link.gbp_account_id) return link.gbp_account_id;
  const name = await resolveAccountName(link.gbp_location_id);
  await (createAdminClient() as any).from("locapass_gbp_links").update({ gbp_account_id: name }).eq("shop_id", link.shop_id);
  return name;
}
