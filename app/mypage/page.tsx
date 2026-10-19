import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles } from "@/lib/auth/roles";
import { reservationEnabled } from "@/lib/reservation/config";
import { MypageClient, type PostShop, type SavedReel, type FollowedCast, type FavoriteShop, type MyComment } from "@/components/MypageClient";
import { getJstNow, toJstDateString, isWithinWorkingWindow } from "@/lib/reels/nowWorking";
import { getMemberPhotos } from "@/lib/photo/getPhotoPosts";

function buildMedia(videoUrl: string | null, posterUrl: string | null, images: unknown): SavedReel["media"] {
  if (videoUrl) return [{ type: "video", url: videoUrl, poster: posterUrl ?? undefined }];
  const imageList = (images as { url: string }[] | null) ?? [];
  if (imageList.length > 0) return imageList.map((img) => ({ type: "image", url: img.url }));
  return posterUrl ? [{ type: "image", url: posterUrl }] : [];
}

export default async function MypagePage() {
  const user = await requireCurrentUser();
  const supabase = await createClient();

  const nowJst = getJstNow();
  const today = toJstDateString(nowJst);
  const yesterday = toJstDateString(new Date(nowJst.getTime() - 24 * 60 * 60 * 1000));

  // 本家マイページと同じく、フォロー中のキャスト・お気に入り店舗・自分のコメントを locapass から読む。
  const [followsRes, favoritesRes, commentsRes] = await Promise.all([
    supabase
      .from("locapass_cast_follows")
      .select(
        "cast_id, cast:locapass_public_casts ( id, name, avatar_url, shop_id, issue_no, shops:locapass_shops ( name, slug, portal:locapass_portals ( slug ) ), schedules:locapass_schedules ( is_working_today, date, start_time, end_time ) )",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("locapass_shop_favorites")
      .select("shop_id, shop:locapass_shops ( id, name, slug, area, status, portal:locapass_portals ( slug ) )")
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
      const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
      const schedules = Array.isArray(cast.schedules) ? cast.schedules : cast.schedules ? [cast.schedules] : [];
      // 「本日出勤中」は日付だけでなく、シフト時間(前後1時間の余裕あり、深夜跨ぎ対応)に今が入っているかで判定する。
      // 開始・終了が未入力の行は時間が決まっていないので、従来どおり日付だけで判定する。
      const isWorkingToday = schedules.some(
        (sch: { date: string; is_working_today: boolean; start_time: string | null; end_time: string | null }) => {
          if (!sch.is_working_today) return false;
          if (!sch.start_time || !sch.end_time) return sch.date === today;
          return isWithinWorkingWindow(
            { date: sch.date, startTime: sch.start_time, endTime: sch.end_time },
            today,
            yesterday,
            nowJst,
          );
        },
      );
      return {
        id: cast.id,
        name: cast.name,
        avatarUrl: cast.avatar_url,
        shopName: shop?.name ?? null,
        shopSlug: shop?.slug ?? null,
        portalSlug: portal?.slug ?? null,
        issueNo: cast.issue_no,
        isWorkingToday,
      };
    })
    .filter((c): c is FollowedCast => c !== null);

  const favoriteShops: FavoriteShop[] = (favoritesRes.data ?? [])
    .map((row) => {
      const shop = Array.isArray(row.shop) ? row.shop[0] : row.shop;
      if (!shop) return null;
      const portal = Array.isArray(shop.portal) ? shop.portal[0] : shop.portal;
      if (!portal) return null;
      return { id: shop.id, name: shop.name, slug: shop.slug, portalSlug: portal.slug, area: shop.area, status: shop.status };
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

  // 店舗管理者なら、自分の店舗への投稿ボタン(通常/ブースト)を出す。
  let postShops: PostShop[] = [];
  const roles = await fetchMyRoles(supabase);
  if (roles && roles.shop_admin_shop_ids.length > 0) {
    const { data: shopRows } = await supabase.from("locapass_shops").select("id, name").in("id", roles.shop_admin_shop_ids);
    postShops = (shopRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  }
  // システム管理者・エリア管理者は自分の店舗を持たないので、管理できる店舗を選んで投稿する(RLSで見える店舗=管理できる店舗)。
  let operatorShops: PostShop[] = [];
  if (roles && (roles.super_admin || roles.portal_ids.length > 0)) {
    const { data: shopRows } = await supabase.from("locapass_shops").select("id, name").order("name").limit(500);
    operatorShops = (shopRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  }

  // マイページから管理側の画面へ入る入口(ヘッダーの「管理」ボタンはルート管理者専用のため、それ以外の管理側の立場はここから入る)。
  const managementLinks: { label: string; href: string }[] = [];
  if (roles && !roles.super_admin) {
    if (roles.portal_ids.length > 0) managementLinks.push({ label: "エリア管理", href: "/admin" });
    for (const shop of postShops) managementLinks.push({ label: `店舗管理: ${shop.name}`, href: `/dashboard/shop/${shop.id}` });
    if (roles.staff) managementLinks.push({ label: "スタッフ画面", href: "/dashboard/staff" });
    if (roles.cast) managementLinks.push({ label: "キャスト画面", href: "/dashboard/cast" });
  }

  // 自分が投稿した写真・動画(みんなのフォト)。取得に失敗してもマイページ全体は表示する。
  const myPhotos = (await getMemberPhotos(user.id).catch(() => null))?.posts ?? [];

  // 優先予約の履歴リンク: 機能が公開中、または過去に予約がある人だけ。
  let showReservations = reservationEnabled();
  if (!showReservations) {
    const { count } = await (supabase as any).from("locapass_reservations").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    showReservations = (count ?? 0) > 0;
  }

  const favoriteReelsRes = await supabase
    .from("locapass_member_favorite_reels")
    .select(
      "reel_id, locapass_reels ( id, caption, video_url, poster_url, images, like_count, shop_id, locapass_shops!locapass_reels_shop_id_fkey ( name, slug, portal:locapass_portals ( slug ) ) )",
    )
    .eq("member_id", user.id)
    .order("created_at", { ascending: false });

  const savedReels: SavedReel[] = (favoriteReelsRes.data ?? [])
    .map((row) => {
      const reel = Array.isArray(row.locapass_reels) ? row.locapass_reels[0] : row.locapass_reels;
      if (!reel || !reel.shop_id) return null;
      const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
      const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
      if (!shop || !portal) return null;
      return {
        id: reel.id,
        caption: reel.caption,
        media: buildMedia(reel.video_url, reel.poster_url, reel.images),
        likesCount: reel.like_count,
        shopId: reel.shop_id,
        shopSlug: shop.slug,
        portalSlug: portal.slug,
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
      postShops={postShops}
      managementLinks={managementLinks}
      myPhotos={myPhotos}
      showReservations={showReservations}
      operatorShops={operatorShops}
    />
  );
}
