import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { photoText } from "@/lib/photo/serverText";
import { notifyPhotoFollow } from "@/lib/photo/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 投稿者のフォローのON/OFF(トグル)。自分自身はフォローできない。 */
export async function POST(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { t } = await photoText();
  const { memberId } = await params;
  if (!UUID.test(memberId)) return NextResponse.json({ error: t.apiBadInput }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });
  if (user.id === memberId) return NextResponse.json({ error: t.apiSelfFollow }, { status: 400 });

  const admin = createAdminClient();
  // 写真を投稿したことのある会員だけがフォロー対象(存在しない会員IDの行を作らない)。
  const { count: posted } = await admin
    .from("area_photo_posts")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId);
  if (!posted) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  const { data: existing } = await admin
    .from("area_photo_follows")
    .select("id")
    .eq("follower_member_id", user.id)
    .eq("followee_member_id", memberId)
    .maybeSingle();

  let following: boolean;
  if (existing) {
    await admin.from("area_photo_follows").delete().eq("id", existing.id);
    following = false;
  } else {
    await admin.from("area_photo_follows").insert({ follower_member_id: user.id, followee_member_id: memberId });
    following = true;
  }

  // フォローしたときだけ、相手に通知(レスポンスを返した後に行い、失敗してもフォロー自体は成功のまま)。
  if (following) {
    after(() => notifyPhotoFollow(user.id, memberId).catch((e) => console.error("photo follow notify failed", e)));
  }

  const { count } = await admin
    .from("area_photo_follows")
    .select("id", { count: "exact", head: true })
    .eq("followee_member_id", memberId);
  return NextResponse.json({ following, followerCount: count ?? 0 });
}
