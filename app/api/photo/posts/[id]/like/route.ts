import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 写真へのいいねのON/OFF(トグル)。書き込みはRLSをバイパスするため、本人確認はここで行う。 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "不正な投稿です。" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const admin = createAdminClient();
  const { data: post } = await admin.from("area_photo_posts").select("id").eq("id", id).maybeSingle();
  if (!post) return NextResponse.json({ error: "投稿が見つかりません。" }, { status: 404 });

  const { data: existing } = await admin
    .from("area_photo_likes")
    .select("id")
    .eq("post_id", id)
    .eq("member_id", user.id)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await admin.from("area_photo_likes").delete().eq("id", existing.id);
    liked = false;
  } else {
    // 同時押しでUNIQUE(post_id, member_id)に当たっても、結果は「いいね済み」で同じなので無視する。
    await admin.from("area_photo_likes").insert({ post_id: id, member_id: user.id });
    liked = true;
  }

  const { count } = await admin.from("area_photo_likes").select("id", { count: "exact", head: true }).eq("post_id", id);
  return NextResponse.json({ liked, likeCount: count ?? 0 });
}
