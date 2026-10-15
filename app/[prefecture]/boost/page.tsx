import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoostFeed } from "@/components/boost/BoostFeed";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { getActiveBoosts } from "@/lib/boost/getBoosts";
import { createClient } from "@/lib/supabase/server";
import { isSiteTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

// params.prefecture の実体は locapass_portals.slug(例: mito)。そのポータルの店舗のブーストだけを出す。
export async function generateMetadata({ params }: { params: Promise<{ prefecture: string }> }): Promise<Metadata> {
  const { prefecture } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("locapass_portals").select("name").eq("slug", prefecture).maybeSingle();
  return { title: `⚡ 緊急ブースト${data ? ` | ${data.name}` : ""}`, robots: { index: false } };
}

export default async function PortalBoostPage({ params }: { params: Promise<{ prefecture: string }> }) {
  const { prefecture } = await params;
  const supabase = await createClient();
  const { data: portal } = await supabase.from("locapass_portals").select("id, theme").eq("slug", prefecture).maybeSingle();
  if (!portal) notFound();
  const items = await getActiveBoosts(portal.id);
  return (
    <>
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <BoostFeed initial={items} portalSlug={prefecture} />
    </>
  );
}
