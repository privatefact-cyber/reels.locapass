import { createStaticClient } from "@/lib/supabase/static";

export type PhotoPost = {
  id: string;
  memberId: string | null;
  userName: string;
  avatarUrl: string | null;
  imageUrl: string;
  latitude: number;
  longitude: number;
  address: string | null;
  spotName: string;
  comment: string | null;
  tags: string[];
  createdAt: string;
  site: string;
  placeKind: "listed" | "spot" | "free" | null;
  placeId: string | null;
  venueId: string | null;
  placeName: string | null;
  /** 動画投稿のとき、動画本体(R2)のURL。imageUrlはその1コマ(ポスター)。 */
  videoUrl: string | null;
  likeCount: number;
};

export type PhotoArea = { slug: string; name: string; nameEn: string | null };

export type PhotoProfile = {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  postCount: number;
  likesReceived: number;
  followerCount: number;
  followingCount: number;
};

export const PHOTO_PAGE_SIZE = 90;

export const POST_COLUMNS =
  "id,member_id,user_name,avatar_url,image_url,latitude,longitude,address,spot_name,comment,tags,created_at,site,place_kind,place_id,place_name,venue_id,video_url";

type Supabase = ReturnType<typeof createStaticClient>;
export type PostRow = {
  id: string;
  member_id: string | null;
  user_name: string;
  avatar_url: string | null;
  image_url: string;
  latitude: number;
  longitude: number;
  address: string | null;
  spot_name: string;
  comment: string | null;
  tags: unknown;
  created_at: string;
  site: string;
  place_kind: string | null;
  place_id: string | null;
  place_name: string | null;
  venue_id: string | null;
  video_url: string | null;
};

export async function toPosts(supabase: Supabase, rows: PostRow[]): Promise<PhotoPost[]> {
  const ids = rows.map((r) => r.id);
  const likeCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: likes } = await supabase.from("area_photo_likes").select("post_id").in("post_id", ids);
    for (const l of likes ?? []) likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
  }
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    userName: r.user_name,
    avatarUrl: r.avatar_url,
    imageUrl: r.image_url,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    spotName: r.spot_name,
    comment: r.comment,
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    createdAt: r.created_at,
    site: r.site,
    placeKind: r.place_kind === "listed" || r.place_kind === "spot" || r.place_kind === "free" ? r.place_kind : null,
    placeId: r.place_id,
    venueId: r.venue_id,
    placeName: r.place_name,
    videoUrl: r.video_url,
    likeCount: likeCounts.get(r.id) ?? 0,
  }));
}

/**
 * エリアフォト(ユーザー投稿写真)の最新一覧。誰でも読める公開データなので匿名クライアントで取得する。
 * areaSlugを渡すとそのエリアだけ、省略すると全エリア。投稿のsiteは写真の位置から自動判定された
 * エリアのスラッグ('other'はどのエリアの掲載店からも遠い投稿)。
 */
export async function getPhotoPosts(
  areaSlug: string | null,
  limit: number = PHOTO_PAGE_SIZE,
): Promise<{ posts: PhotoPost[]; areas: PhotoArea[] }> {
  const supabase = createStaticClient();

  let query = supabase
    .from("area_photo_posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (areaSlug) query = query.eq("site", areaSlug);

  const [{ data: rows, error }, { data: siteRows }, { data: portals }] = await Promise.all([
    query,
    supabase.from("area_photo_posts").select("site").limit(2000),
    supabase.from("locapass_portals").select("slug,name,name_en"),
  ]);
  if (error) throw error;

  const posts = await toPosts(supabase, (rows ?? []) as PostRow[]);

  // エリア切り替えには、実際に投稿があるエリアだけを出す。
  const portalBySlug = new Map((portals ?? []).map((p) => [p.slug, p]));
  const present = Array.from(new Set((siteRows ?? []).map((r) => r.site)));
  const areas: PhotoArea[] = present
    .map((slug) => {
      const portal = portalBySlug.get(slug);
      return { slug, name: portal?.name ?? slug, nameEn: portal?.name_en ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return { posts, areas };
}

/** 1人の会員の投稿とプロフィール(投稿数・もらったいいね・フォロワー数)。投稿が1件も無ければnull。 */
export async function getMemberPhotos(memberId: string): Promise<{ profile: PhotoProfile; posts: PhotoPost[] } | null> {
  const supabase = createStaticClient();

  const { data: rows, error } = await supabase
    .from("area_photo_posts")
    .select(POST_COLUMNS)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(PHOTO_PAGE_SIZE);
  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  const posts = await toPosts(supabase, rows as PostRow[]);

  const [{ count: followerCount }, { count: followingCount }, { count: postCount }] = await Promise.all([
    supabase.from("area_photo_follows").select("id", { count: "exact", head: true }).eq("followee_member_id", memberId),
    supabase.from("area_photo_follows").select("id", { count: "exact", head: true }).eq("follower_member_id", memberId),
    supabase.from("area_photo_posts").select("id", { count: "exact", head: true }).eq("member_id", memberId),
  ]);

  // 表示名・アイコンは会員のプロフィール(公開用ビュー)を優先し、無ければ最新の投稿時点の値を使う。
  const { data: member } = await supabase
    .from("locapass_public_members")
    .select("nickname,avatar_url")
    .eq("id", memberId)
    .maybeSingle();
  const latest = posts[0];
  return {
    profile: {
      memberId,
      name: member?.nickname || latest.userName,
      avatarUrl: member?.avatar_url ?? latest.avatarUrl,
      postCount: postCount ?? posts.length,
      likesReceived: posts.reduce((sum, p) => sum + p.likeCount, 0),
      followerCount: followerCount ?? 0,
      followingCount: followingCount ?? 0,
    },
    posts,
  };
}

/** 会員が「いいね」した写真・動画(いいねした新しい順)。行きたい場所のストックとして、マイページに出す。 */
export async function getLikedPosts(memberId: string, limit: number = PHOTO_PAGE_SIZE): Promise<PhotoPost[]> {
  const supabase = createStaticClient();
  const { data: likes, error } = await supabase
    .from("area_photo_likes")
    .select("post_id, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = (likes ?? []).map((l) => l.post_id);
  if (ids.length === 0) return [];

  const { data: rows, error: postsError } = await supabase.from("area_photo_posts").select(POST_COLUMNS).in("id", ids);
  if (postsError) throw postsError;
  // 削除済みの投稿は取れないので自然に外れる。並びは「いいねした順」に戻す。
  const byId = new Map(((rows ?? []) as PostRow[]).map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is PostRow => Boolean(r));
  return toPosts(supabase, ordered);
}
