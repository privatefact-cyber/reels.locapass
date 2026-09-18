import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { MypageClient, type SavedReel, type FollowedCast, type FavoriteShop, type MyComment } from "@/components/MypageClient";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";

export default async function MypagePage() {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const today = toJstDateString(getJstNow());

  const [likesRes, followsRes, favoritesRes, commentsRes] = await Promise.all([
    supabase
      .from("reel_likes")
      // shopsとreelsの間には外部キーが2本(reels.shop_id / shops.map_preview_reel_id)あるので、使うキーを明示する。
      .select("reel_id, reels ( id, caption, media, likes_count, shop_id, shops!reels_shop_id_fkey ( name ) )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_cast_follows")
      .select(
        "cast_id, cast_members ( id, name, avatar_url, shop_id, shops ( name ), schedules ( is_working_today, date ) )",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_shop_favorites")
      .select("shop_id, shops ( id, name, area, status )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reel_comments")
      .select("id, body, created_at, reel_id, reels ( id, caption, media ) ")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const savedReels: SavedReel[] = (likesRes.data ?? [])
    .map((row) => {
      const reel = Array.isArray(row.reels) ? row.reels[0] : row.reels;
      if (!reel) return null;
      const shop = Array.isArray(reel.shops) ? reel.shops[0] : reel.shops;
      return {
        id: reel.id,
        caption: reel.caption,
        media: (reel.media as SavedReel["media"]) ?? [],
        likesCount: reel.likes_count,
        shopId: reel.shop_id,
        shopName: shop?.name ?? null,
      };
    })
    .filter((r): r is SavedReel => r !== null);

  const followedCasts: FollowedCast[] = (followsRes.data ?? [])
    .map((row) => {
      const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
      if (!cast) return null;
      const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;
      const schedules = Array.isArray(cast.schedules) ? cast.schedules : cast.schedules ? [cast.schedules] : [];
      const isWorkingToday = schedules.some(
        (s: { date: string; is_working_today: boolean }) => s.date === today && s.is_working_today,
      );
      return {
        id: cast.id,
        name: cast.name,
        avatarUrl: cast.avatar_url,
        shopName: shop?.name ?? null,
        isWorkingToday,
      };
    })
    .filter((c): c is FollowedCast => c !== null);

  const favoriteShops: FavoriteShop[] = (favoritesRes.data ?? [])
    .map((row) => {
      const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
      if (!shop) return null;
      return {
        id: shop.id,
        name: shop.name,
        area: shop.area,
        status: shop.status,
      };
    })
    .filter((s): s is FavoriteShop => s !== null);

  const myComments: MyComment[] = (commentsRes.data ?? [])
    .map((row) => {
      const reel = Array.isArray(row.reels) ? row.reels[0] : row.reels;
      return {
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        reelId: row.reel_id,
        reelCaption: reel?.caption ?? null,
        reelThumbnailUrl:
          reel?.media && Array.isArray(reel.media) && reel.media[0]
            ? (reel.media[0] as { type: string; url: string; poster?: string }).poster ??
              (reel.media[0] as { type: string; url: string; poster?: string }).url
            : null,
      };
    })
    .filter((c): c is MyComment => c !== null);

  return (
    <MypageClient
      userId={user.id}
      initialNickname={user.nickname}
      initialAvatarUrl={user.avatarUrl}
      savedReels={savedReels}
      followedCasts={followedCasts}
      favoriteShops={favoriteShops}
      myComments={myComments}
    />
  );
}
