import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { photoText } from "@/lib/photo/serverText";
import { notifyPhotoLike } from "@/lib/photo/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 写真へのいいねのON/OFF(トグル)。書き込みはRLSをバイパスするため、本人確認はここで行う。 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await photoText();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: t.apiBadInput }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  const admin = createAdminClient();
  const { data: post } = await admin.from("area_photo_posts").select("id").eq("id", id).maybeSingle();
  if (!post) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

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

  // いいねを付けたときだけ、投稿者に通知(レスポンスを返した後に行い、失敗してもいいね自体は成功のまま)。
  if (liked) {
    after(() => notifyPhotoLike(user.id, id).catch((e) => console.error("photo like notify failed", e)));
  }

  const { count } = await admin.from("area_photo_likes").select("id", { count: "exact", head: true }).eq("post_id", id);
  return NextResponse.json({ liked, likeCount: count ?? 0 });
}
