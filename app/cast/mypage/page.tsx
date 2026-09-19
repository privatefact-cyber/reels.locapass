import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { requireCurrentCast } from "@/lib/cast/current-cast";
import { createClient } from "@/lib/supabase/server";
import { CastMypageClient, type MyReel, type MyStory } from "@/components/CastMypageClient";

export default async function CastMypage() {
  const cast = await requireCurrentCast();
  if (!cast) {
    redirect("/cast/login");
  }

  const qrDataUrl = await QRCode.toDataURL(`https://reels.locapass.net/c/${cast.cast_code}`, {
    margin: 1,
    width: 220,
  });

  const supabase = await createClient();
  const [{ data: reels }, { data: stories }] = await Promise.all([
    supabase
      .from("reels")
      .select("id, caption, media, likes_count, created_at, is_comments_enabled, pinned_at")
      .eq("cast_id", cast.id)
      .eq("post_type", "reel")
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("reels")
      .select("id, media, created_at, expires_at")
      .eq("cast_id", cast.id)
      .eq("post_type", "story")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const myReels: MyReel[] = (reels ?? []).map((r) => ({
    id: r.id,
    caption: r.caption,
    media: (r.media as MyReel["media"]) ?? [],
    likesCount: r.likes_count,
    createdAt: r.created_at,
    isCommentsEnabled: r.is_comments_enabled,
    pinnedAt: r.pinned_at,
  }));

  const myStories: MyStory[] = (stories ?? []).map((s) => ({
    id: s.id,
    media: (s.media as MyStory["media"]) ?? [],
    createdAt: s.created_at,
    expiresAt: s.expires_at!,
  }));

  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  return (
    <CastMypageClient
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
