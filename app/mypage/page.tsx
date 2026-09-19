import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { MypageClient, type SavedReel, type FollowedCast, type FavoriteShop, type MyComment } from "@/components/MypageClient";

function buildMedia(videoUrl: string | null, posterUrl: string | null, images: unknown): SavedReel["media"] {
  if (videoUrl) return [{ type: "video", url: videoUrl, poster: posterUrl ?? undefined }];
  const imageList = (images as { url: string }[] | null) ?? [];
  if (imageList.length > 0) return imageList.map((img) => ({ type: "image", url: img.url }));
  return posterUrl ? [{ type: "image", url: posterUrl }] : [];
}

export default async function MypagePage() {
  const user = await requireCurrentUser();
  const supabase = await createClient();

  // locapassにはキャストフォロー・リールコメントの受け皿が無いため、常に空で返す。
  // 店舗お気に入り(locapass_member_favorite_shops)はshop_id列が無く(portal_id+author_urlの
  // 別設計)、店舗単位のお気に入り機能としてはまだ使えないため、こちらも当面は空で返す
  // (マイページのタブUIは既存のまま、対応データが無い分だけ0件表示になる)。
  const followedCasts: FollowedCast[] = [];
  const myComments: MyComment[] = [];
  const favoriteShops: FavoriteShop[] = [];

  const favoriteReelsRes = await supabase
    .from("locapass_member_favorite_reels")
    .select(
      "reel_id, locapass_reels ( id, caption, video_url, poster_url, images, like_count, shop_id, locapass_shops ( name ) )",
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
