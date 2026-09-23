import { createClient } from "@/lib/supabase/server";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { EventReel } from "@/components/EventReel";
import type { PortalEvent } from "@/lib/types/shop";
import { isHiddenByDefaultGenre } from "@/lib/shop/genres";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = await createClient();

  const [{ data: eventRows }, { data: shops }] = await Promise.all([
    supabase
      .from("locapass_shop_events")
      .select(
        "id, title, body, starts_at, ends_at, image_url, gallery_image_urls, shop_id, shops:locapass_shops ( name, area, genre:category, status )",
      )
      .not("image_url", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("locapass_shops").select("genre:category").eq("status", "active").or(EXCLUDE_OFFICIAL_FILTER),
  ]);

  const now = Date.now();
  const events: PortalEvent[] = (eventRows ?? []).flatMap((row) => {
    const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
    if (!shop || shop.status !== "active" || !row.image_url) return [];
    // 終了日時を過ぎたイベントはトップのイベントリールから除外する。
    if (row.ends_at && new Date(row.ends_at).getTime() < now) return [];
    return [
      {
        id: row.id,
        title: row.title,
        body: row.body,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        imageUrl: row.image_url,
        galleryImageUrls: row.gallery_image_urls ?? [],
        shopId: row.shop_id,
        shopName: shop.name,
        area: shop.area,
        genre: shop.genre,
      },
    ];
  });

  // アフター(深夜飲食店)はイベントを載せる業態ではないので、イベントの絞り込みタグには出さない。
  const genreChoices = Array.from(
    new Set(
      (shops ?? [])
        .map((s) => s.genre)
        .filter((g): g is string => !!g && !isHiddenByDefaultGenre(g)),
    ),
  );

  return <EventReel events={events} genreChoices={genreChoices} />;
}
