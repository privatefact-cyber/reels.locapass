import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { MypageClient, type SavedReel, type FollowedCast, type FavoriteShop, type MyComment } from "@/components/MypageClient";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";

function buildMedia(videoUrl: string | null, posterUrl: string | null, images: unknown): SavedReel["media"] {
  if (videoUrl) return [{ type: "video", url: videoUrl, poster: posterUrl ?? undefined }];
  const imageList = (images as { url: string }[] | null) ?? [];
  if (imageList.length > 0) return imageList.map((img) => ({ type: "image", url: img.url }));
  return posterUrl ? [{ type: "image", url: posterUrl }] : [];
}

export default async function MypagePage() {
  const user = await requireCurrentUser();
  const supabase = await createClient();

  const today = toJstDateString(getJstNow());

  // 本家マイページと同じく、フォロー中のキャスト・お気に入り店舗・自分のコメントを locapass から読む。
  const [followsRes, favoritesRes, commentsRes] = await Promise.all([
    supabase
      .from("locapass_cast_follows")
      .select(
        "cast_id, cast:locapass_public_casts ( id, name, avatar_url, shop_id, shops:locapass_shops ( name ), schedules:locapass_schedules ( is_working_today, date ) )",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("locapass_shop_favorites")
      .select("shop_id, shop:locapass_shops ( id, name, area, status )")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("locapass_reel_comments")
      .select("id, body, created_at, reel_id, reel:locapass_reels ( id, caption, video_url, poster_url, images )")
      .eq("user_id", user.id)
      .eq("author_type", "customer")
      .order("created_at", { ascending: false }),
  ]);

  const followedCasts: FollowedCast[] = (followsRes.data ?? [])
    .map((row) => {
      const cast = Array.isArray(row.cast) ? row.cast[0] : row.cast;
      if (!cast) return null;
      const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;
      const schedules = Array.isArray(cast.schedules) ? cast.schedules : cast.schedules ? [cast.schedules] : [];
      const isWorkingToday = schedules.some(
        (sch: { date: string; is_working_today: boolean }) => sch.date === today && sch.is_working_today,
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
      const shop = Array.isArray(row.shop) ? row.shop[0] : row.shop;
      if (!shop) return null;
      return { id: shop.id, name: shop.name, area: shop.area, status: shop.status };
    })
    .filter((s): s is FavoriteShop => s !== null);

  const myComments: MyComment[] = (commentsRes.data ?? []).map((row) => {
    const reel = Array.isArray(row.reel) ? row.reel[0] : row.reel;
    const media = reel ? buildMedia(reel.video_url, reel.poster_url, reel.images)[0] : undefined;
    return {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      reelId: row.reel_id,
      reelCaption: reel?.caption ?? null,
      reelThumbnailUrl: media ? (media.poster ?? media.url) : null,
    };
  });

  const favoriteReelsRes = await supabase
    .from("locapass_member_favorite_reels")
    .select(
      "reel_id, locapass_reels ( id, caption, video_url, poster_url, images, like_count, shop_id, locapass_shops!locapass_reels_shop_id_fkey ( name ) )",
    )
    .eq("member_id", user.id)
    .order("created_at", { ascending: false });

  const savedReels: SavedReel[] = (favoriteReelsRes.data ?? [])
    .map((row) => {
      const reel = Array.isArray(row.locapass_reels) ? row.locapass_reels[0] : row.locapass_reels;
      if (!reel || !reel.shop_id) return null;
      const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
      return {
        id: reel.id,
        caption: reel.caption,
        media: buildMedia(reel.video_url, reel.poster_url, reel.images),
        likesCount: reel.like_count,
        shopId: reel.shop_id,
        shopName: shop?.name ?? null,
      };
    })
    .filter((r): r is SavedReel => r !== null);

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
