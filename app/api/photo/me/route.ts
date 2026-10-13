import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** ログイン中の会員が「いいね済みの投稿」と「フォロー中の会員」。ボタンの初期表示に使う(ログインしていなければuserId: null)。 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ userId: null, likedPostIds: [], followingIds: [] }, { headers: { "Cache-Control": "no-store" } });

  const [{ data: likes }, { data: follows }] = await Promise.all([
    supabase.from("area_photo_likes").select("post_id").eq("member_id", user.id).limit(2000),
    supabase.from("area_photo_follows").select("followee_member_id").eq("follower_member_id", user.id).limit(2000),
  ]);
  return NextResponse.json(
    {
      userId: user.id,
      likedPostIds: (likes ?? []).map((l) => l.post_id),
      followingIds: (follows ?? []).map((f) => f.followee_member_id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
