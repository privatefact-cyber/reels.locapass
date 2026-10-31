import { resolvePostShopList, type PostShop } from "@/lib/photo/resolvePostShops";
import { createStaticClient } from "@/lib/supabase/static";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { pickTranslation } from "@/lib/i18n/contentTranslation";
import { extraSourceLang, nativeLanguageName } from "@/lib/i18n/originalText";

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
  /** 文章が4言語以外(ポルトガル語など)で書かれているとき、書かれたままの原文(「原文を見る」用)。翻訳が無ければ null。 */
  original: { lang: string; spotName: string; comment: string | null; address: string | null } | null;
  /** 掲載店の写真なら、その店舗ページへのリンク(店名をタップして店舗詳細へ飛ぶため)。 */
  shop: { name: string; href: string } | null;
  /** 紹介している店舗すべて(複数店舗を紹介した動画用)。先頭が `shop`。マイページの店舗・エリア絞り込みに使う。 */
  shops: PostShop[];
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
/** マイページの投稿ライブラリで取る投稿の上限(1人あたり)。 */
export const MEMBER_PHOTO_MAX = 900;

export const POST_COLUMNS =
  "id,member_id,user_name,avatar_url,image_url,latitude,longitude,address,spot_name,comment,tags,created_at,site,place_kind,place_id,place_name,venue_id,video_url,translations";

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
  translations: unknown;
};

export async function toPosts(supabase: Supabase, rows: PostRow[]): Promise<PhotoPost[]> {
  const ids = rows.map((r) => r.id);
  const likeCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: likes } = await supabase.from("area_photo_likes").select("post_id").in("post_id", ids);
    for (const l of likes ?? []) likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
  }
  const shopsByPost = await resolvePostShopList(supabase, rows).catch(() => new Map<string, PostShop[]>());
  // 閲覧者の言語に合わせて、場所名・一言・住所は翻訳があればそれを出す(無ければ原文)。
  const locale = await getServerLocale();
  const tr = (r: PostRow, original: string | null, key: string) => pickTranslation(locale, original, r.translations, key).text;
  const originalOf = (r: PostRow): PhotoPost["original"] => {
    const source = extraSourceLang(r.translations);
    return source ? { lang: nativeLanguageName(source), spotName: r.spot_name, comment: r.comment, address: r.address } : null;
  };
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    userName: r.user_name,
    avatarUrl: r.avatar_url,
    imageUrl: r.image_url,
    latitude: r.latitude,
    longitude: r.longitude,
    address: tr(r, r.address, "address"),
    spotName: tr(r, r.spot_name, "spot_name") ?? r.spot_name,
    comment: tr(r, r.comment, "comment"),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    createdAt: r.created_at,
    site: r.site,
    placeKind: r.place_kind === "listed" || r.place_kind === "spot" || r.place_kind === "free" ? r.place_kind : null,
    placeId: r.place_id,
    venueId: r.venue_id,
    placeName: r.place_name === r.spot_name ? (tr(r, r.place_name, "spot_name") ?? r.place_name) : r.place_name,
    videoUrl: r.video_url,
    likeCount: likeCounts.get(r.id) ?? 0,
    original: originalOf(r),
    shop: shopsByPost.get(r.id)?.[0] ? { name: shopsByPost.get(r.id)![0].name, href: shopsByPost.get(r.id)![0].href } : null,
    shops: shopsByPost.get(r.id) ?? [],
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
export async function getMemberPhotos(
  memberId: string,
  opts: { all?: boolean } = {},
): Promise<{ profile: PhotoProfile; posts: PhotoPost[] } | null> {
  const supabase = createStaticClient();

  // all: マイページの投稿ライブラリ用。古い投稿まで全部(上限 MEMBER_PHOTO_MAX)を、PHOTO_PAGE_SIZE件ずつ取る
  // (一度に取る件数が多いと、いいね数・店舗の紐づけを調べるURLが長くなりすぎるため)。
  const total = opts.all ? MEMBER_PHOTO_MAX : PHOTO_PAGE_SIZE;
  const rows: PostRow[] = [];
  for (let from = 0; from < total; from += PHOTO_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("area_photo_posts")
      .select(POST_COLUMNS)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .range(from, Math.min(from + PHOTO_PAGE_SIZE, total) - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PostRow[]));
    if ((data ?? []).length < PHOTO_PAGE_SIZE) break;
  }
  if (rows.length === 0) return null;

  const posts: PhotoPost[] = [];
  for (let i = 0; i < rows.length; i += PHOTO_PAGE_SIZE) posts.push(...(await toPosts(supabase, rows.slice(i, i + PHOTO_PAGE_SIZE))));

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

/** 写真1枚(共有用の個別ページ)。無ければnull。 */
export async function getPhotoPostById(id: string): Promise<PhotoPost | null> {
  const supabase = createStaticClient();
  const { data: row, error } = await supabase.from("area_photo_posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  if (error || !row) return null;
  const [post] = await toPosts(supabase, [row as PostRow]);
  return post ?? null;
}
