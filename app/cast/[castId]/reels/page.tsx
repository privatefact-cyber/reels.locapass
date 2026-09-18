import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import type { ReelItem } from "@/lib/reels/types";

export const revalidate = 60;

export default async function CastReelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ castId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { castId } = await params;
  const { start } = await searchParams;
  const supabase = await createClient();

  const { data: cast, error: castError } = await supabase
    .from("cast_members")
    .select("id, name, avatar_url, shop_id, shops ( id, name, area, address, genre )")
    .eq("id", castId)
    .single();

  if (castError && castError.code !== "PGRST116") {
    throw new Error(`cast_members取得に失敗しました: ${castError.message}`);
  }

  if (!cast) {
    notFound();
  }

  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const { data: reelRows } = await supabase
    .from("reels")
    .select("id, caption, media, likes_count, cast_id, shop_id, link_url, created_at, is_comments_enabled")
    .eq("cast_id", castId)
    .eq("status", "published")
    // ストーリーはRLS上フォロワーには読めるので、リール再生に混ざらないよう明示的に除外する。
    .eq("post_type", "reel")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const reels: ReelItem[] = (reelRows ?? []).map((row) => ({
    id: row.id,
    caption: row.caption,
    media: (row.media as ReelItem["media"]) ?? [],
    likesCount: row.likes_count,
    castId: row.cast_id,
    castName: cast.name,
    castAvatarUrl: cast.avatar_url,
    shopId: row.shop_id,
    shopName: shop?.name ?? "",
    area: shop?.area ?? null,
    address: shop?.address ?? null,
    genre: shop?.genre ?? null,
    linkUrl: row.link_url,
    createdAt: row.created_at,
    isCommentsEnabled: row.is_comments_enabled,
  }));

  // プロフィールのグリッドから特定の投稿をタップして来た場合、その投稿から再生を始める
  // (並び自体は変えず、配列を回転させて対象を先頭に持ってくるだけ)。
  const startIndex = start ? reels.findIndex((r) => r.id === start) : -1;
  const orderedReels =
    startIndex > 0 ? [...reels.slice(startIndex), ...reels.slice(0, startIndex)] : reels;

  return (
    <div className="space-y-3">
      <Link href={`/cast/${cast.id}`} className="inline-block px-1 text-sm text-brand hover:underline">
        ← {cast.name} のプロフィールに戻る
      </Link>
      <ReelLoopFeed reels={orderedReels} />
    </div>
  );
}
