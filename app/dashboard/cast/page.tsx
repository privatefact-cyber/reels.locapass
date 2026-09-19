import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { requireCurrentCast } from "@/lib/cast/current-cast";
import { createClient } from "@/lib/supabase/server";
import { CastDashboardClient, type MyReel, type MyStory } from "@/components/locapass-mypage/CastDashboardClient";

type ReelRow = {
  id: string;
  caption: string | null;
  video_url: string | null;
  images: unknown;
  poster_url: string | null;
  like_count: number;
  published_at: string | null;
  updated_at: string;
  expires_at: string | null;
};

function toMedia(r: ReelRow): MyReel["media"] {
  const images = (r.images as { url: string }[] | null) ?? [];
  if (r.video_url) return [{ type: "video", url: r.video_url }];
  if (images.length > 0) return images.map((img) => ({ type: "image" as const, url: img.url }));
  return r.poster_url ? [{ type: "image", url: r.poster_url }] : [];
}

/**
 * cast 本人の画面。LUXELA本家のキャストマイページ(app/cast/mypage)と同じUI。
 * 本人の投稿(locapass_reels.created_by = 本人)だけを扱い、キャストでなければ振り分けに戻す。
 */
export default async function CastDashboardPage() {
  const cast = await requireCurrentCast();
  if (!cast) redirect("/dashboard");

  const qrDataUrl = await QRCode.toDataURL(`https://reels.locapass.net/c/${cast.cast_code}`, {
    margin: 1,
    width: 220,
  });

  const supabase = await createClient();
  const select = "id, caption, video_url, images, poster_url, like_count, published_at, updated_at, expires_at";
  const [{ data: reels }, { data: stories }] = await Promise.all([
    supabase
      .from("locapass_reels")
      .select(select)
      .eq("shop_id", cast.shop_id)
      .eq("created_by", cast.user_id ?? "")
      .eq("reel_type", "permanent")
      .order("published_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("locapass_reels")
      .select(select)
      .eq("shop_id", cast.shop_id)
      .eq("created_by", cast.user_id ?? "")
      .eq("reel_type", "story")
      .gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false, nullsFirst: false }),
  ]);

  // コメント可否・ピン留めは locapass_reels に列が無いため、本家の初期値(コメント可・ピン無し)で表示する。
  const myReels: MyReel[] = ((reels ?? []) as ReelRow[]).map((r) => ({
    id: r.id,
    caption: r.caption,
    media: toMedia(r),
    likesCount: r.like_count,
    createdAt: r.published_at ?? r.updated_at,
    isCommentsEnabled: true,
    pinnedAt: null,
  }));

  const myStories: MyStory[] = ((stories ?? []) as ReelRow[]).map((s) => ({
    id: s.id,
    media: toMedia(s),
    createdAt: s.published_at ?? s.updated_at,
    expiresAt: s.expires_at!,
  }));

  const shop = Array.isArray(cast.locapass_shops) ? cast.locapass_shops[0] : cast.locapass_shops;

  return (
    <CastDashboardClient
      userId={cast.user_id ?? ""}
      portalId={shop?.portal_id ?? 0}
      castId={cast.id}
      shopId={cast.shop_id}
      shopName={shop?.name ?? null}
      castCode={cast.cast_code}
      qrDataUrl={qrDataUrl}
      initialName={cast.name}
      initialPrText={cast.pr_text}
      initialAvatarUrl={cast.avatar_url}
      initialReels={myReels}
      initialStories={myStories}
    />
  );
}
