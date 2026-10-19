import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles } from "@/lib/auth/roles";

/** ログイン中の会員が「いいね済みの投稿」と「フォロー中の会員」。ボタンの初期表示に使う(ログインしていなければuserId: null)。 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ userId: null, isRootAdmin: false, likedPostIds: [], followingIds: [] }, { headers: { "Cache-Control": "no-store" } });

  const [{ data: likes }, { data: follows }, roles] = await Promise.all([
    supabase.from("area_photo_likes").select("post_id").eq("member_id", user.id).limit(2000),
    supabase.from("area_photo_follows").select("followee_member_id").eq("follower_member_id", user.id).limit(2000),
    fetchMyRoles(supabase),
  ]);
  return NextResponse.json(
    {
      userId: user.id,
      // 削除ボタンの出し分け用(ルート管理者は他人の投稿も削除できる。実際の権限確認は削除APIがサーバーで行う)。
      isRootAdmin: roles?.super_admin === true,
      likedPostIds: (likes ?? []).map((l) => l.post_id),
      followingIds: (follows ?? []).map((f) => f.followee_member_id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
