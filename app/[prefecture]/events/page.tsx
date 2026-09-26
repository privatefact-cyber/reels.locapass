import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventReel } from "@/components/EventReel";
import { PortalThemeScope } from "@/components/portal/PortalThemeScope";
import { getPortalEvents } from "@/lib/events/getPortalEvents";
import { isSiteTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

// 子ポータル(/mito/events 等)のイベント。そのポータルに掲載されている店舗のイベントだけを出す。
// params.prefectureの実体はlocapass_portals.slug(app/[prefecture]/page.tsxと同じ事情)。
export default async function PortalEventsPage({ params }: { params: Promise<{ prefecture: string }> }) {
  const { prefecture: slug } = await params;
  const supabase = await createClient();
  const { data: portal } = await supabase
    .from("locapass_portals")
    .select("id, theme")
    .eq("slug", slug)
    .maybeSingle();
  if (!portal) notFound();

  const { events, genreChoices } = await getPortalEvents(portal.id);
  return (
    <>
      <PortalThemeScope theme={isSiteTheme(portal.theme) ? portal.theme : null} />
      <EventReel events={events} genreChoices={genreChoices} />
    </>
  );
}
