import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import type { ReelItem } from "@/lib/reels/types";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";

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
    .from("locapass_public_casts")
    .select("id, name, avatar_url, shop_id, shops:locapass_shops ( id, name, area, address, genre:category )")
    .eq("id", castId)
    .single();

  if (castError && castError.code !== "PGRST116") {
    throw new Error(`locapass_public_casts取得に失敗しました: ${castError.message}`);
  }

  if (!cast) {
    notFound();
  }

  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const { data: reelRows } = await supabase
    .from("locapass_reels")
    .select(
      `id, caption, ${LOCAPASS_REEL_MEDIA_SELECT}, like_count, cast_id, shop_id, action_url, published_at, updated_at, is_comments_enabled`,
    )
    .eq("cast_id", castId)
    .eq("status", "publish")
    // ストーリー(24時間)はリール再生に混ざらないよう明示的に除外する。
    .eq("reel_type", "permanent")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false });

  const reels: ReelItem[] = (reelRows ?? []).map((row) => ({
    id: row.id,
    caption: row.caption,
    media: toReelMedia(row),
    likesCount: row.like_count,
    castId: row.cast_id,
    castName: cast.name,
    castAvatarUrl: cast.avatar_url,
    shopId: row.shop_id ?? cast.shop_id,
    shopName: shop?.name ?? "",
    area: shop?.area ?? null,
    address: shop?.address ?? null,
    genre: shop?.genre ?? null,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
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
