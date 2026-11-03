import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { EventFormSection } from "@/components/locapass-dashboard/EventFormSection";
import { ShopEmbedSection } from "@/components/locapass-dashboard/ShopEmbedSection";
import type { ShopEvent } from "@/lib/types/shop";
import { addEvent, deleteEvent, updateEvent } from "../actions";

/** 「投稿」メニューのイベントのタブ。イベントの投稿・編集と、外部動画(オプション)の追加。 */
export async function EventsTab({ shopId }: { shopId: string }) {
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = (await createClient()) as any;
  const [{ data: eventRows }, { data: embedOpt }] = await Promise.all([
    supabase
      .from("locapass_shop_events")
      .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_at")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    supabase.from("locapass_shops").select("embed_enabled").eq("id", shop.id).maybeSingle(),
  ]);

  const now = Date.now();
  const events: ShopEvent[] = ((eventRows ?? []) as any[]).map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    imageUrl: e.image_url,
    galleryImageUrls: e.gallery_image_urls ?? [],
    isEnded: !!e.ends_at && new Date(e.ends_at).getTime() < now,
  }));

  return (
    <div className="space-y-6">
      <ShopEmbedSection kind="event" shopId={shop.id} enabled={Boolean(embedOpt?.embed_enabled) || viewer.isOperator} />
      <EventFormSection
        shopId={shop.id}
        events={events}
        addEvent={addEvent.bind(null, shop.id)}
        updateEvent={updateEvent.bind(null, shop.id)}
        deleteEvent={deleteEvent.bind(null, shop.id)}
      />
    </div>
  );
}
