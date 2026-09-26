import { EventReel } from "@/components/EventReel";
import { getPortalEvents } from "@/lib/events/getPortalEvents";

export const dynamic = "force-dynamic";

// 全体トップのイベント。全ポータルを横断して表示する(子ポータル単位は/{slug}/events)。
export default async function EventsPage() {
  const { events, genreChoices } = await getPortalEvents(null);
  return <EventReel events={events} genreChoices={genreChoices} />;
}
