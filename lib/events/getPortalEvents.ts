import { createClient } from "@/lib/supabase/server";
import { EXCLUDE_OFFICIAL_FILTER, isHiddenByDefaultGenre } from "@/lib/shop/genres";
import type { PortalEvent } from "@/lib/types/shop";

/**
 * イベント一覧の取得。portalId=nullなら全ポータル横断(全体トップの/events)、
 * 数値ならそのポータル(子ポータル)に掲載されている店舗のイベントだけに絞る(/{slug}/events)。
 */
export async function getPortalEvents(portalId: number | null): Promise<{
  events: PortalEvent[];
  genreChoices: string[];
}> {
  const supabase = await createClient();

  let shopsQuery = supabase
    .from("locapass_shops")
    .select("genre:category")
    .eq("status", "active")
    .or(EXCLUDE_OFFICIAL_FILTER);
  if (portalId !== null) shopsQuery = shopsQuery.eq("portal_id", portalId);

  const [{ data: eventRows }, { data: shops }] = await Promise.all([
    supabase
      .from("locapass_shop_events")
      .select(
        "id, title, body, starts_at, ends_at, image_url, gallery_image_urls, shop_id, shops:locapass_shops ( name, slug, area, genre:category, status, portal_id, portal:locapass_portals ( slug ) )",
      )
      .not("image_url", "is", null)
      .order("created_at", { ascending: false }),
    shopsQuery,
  ]);

  const now = Date.now();
  const events: PortalEvent[] = (eventRows ?? []).flatMap((row) => {
    const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
    const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
    if (!shop || !portal || shop.status !== "active" || !row.image_url) return [];
    if (portalId !== null && shop.portal_id !== portalId) return [];
    // 終了日時を過ぎたイベントはイベントリールから除外する。
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
        shopSlug: shop.slug,
        portalSlug: portal.slug,
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

  return { events, genreChoices };
}
