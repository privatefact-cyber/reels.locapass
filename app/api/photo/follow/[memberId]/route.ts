import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 投稿者のフォローのON/OFF(トグル)。自分自身はフォローできない。 */
export async function POST(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  if (!UUID.test(memberId)) return NextResponse.json({ error: "不正な会員です。" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  if (user.id === memberId) return NextResponse.json({ error: "自分自身はフォローできません。" }, { status: 400 });

  const admin = createAdminClient();
  // 写真を投稿したことのある会員だけがフォロー対象(存在しない会員IDの行を作らない)。
  const { count: posted } = await admin
    .from("area_photo_posts")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId);
  if (!posted) return NextResponse.json({ error: "会員が見つかりません。" }, { status: 404 });

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

  const { count } = await admin
    .from("area_photo_follows")
    .select("id", { count: "exact", head: true })
    .eq("followee_member_id", memberId);
  return NextResponse.json({ following, followerCount: count ?? 0 });
}
