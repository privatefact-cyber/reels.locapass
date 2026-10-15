import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";
import { docsFor } from "@/lib/support/docs";
import { SupportCenter } from "@/components/support/SupportCenter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "サポート・使い方 | locapass", alternates: { canonical: "https://locapass.net/support" } };

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 店舗向けの使い方は、店舗の管理権限を持つログイン中の人にだけ見せる。
  const isShop = user ? hasManagementRole(await fetchMyRoles(supabase)) : false;
  const docs = docsFor(isShop ? ["user", "shop"] : ["user"]).map(({ id, audience, title, body }) => ({ id, audience, title, body }));
  return <SupportCenter docs={docs} isShop={isShop} />;
}
