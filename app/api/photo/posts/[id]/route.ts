import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMyRoles } from "@/lib/auth/roles";
import { photoText } from "@/lib/photo/serverText";
import { getR2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_MARKER = "/storage/v1/object/public/map-photos/";

/**
 * 写真(動画)投稿の削除。削除できるのは、投稿した本人とルート管理者(super_admin)だけ。
 * 書き込みはRLSをバイパスするので、権限の確認はここで行う(画面の削除ボタンの出し分けは見た目だけ)。
 * いいねは投稿の削除にあわせてDBが自動で消す(CASCADE)。画像・動画の実ファイルも消す(失敗しても投稿の削除は成功とする)。
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await photoText();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: t.apiBadInput }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("area_photo_posts")
    .select("id, member_id, image_url, video_url")
    .eq("id", id)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  const isOwner = post.member_id === user.id;
  const isRoot = isOwner ? false : (await fetchMyRoles(supabase))?.super_admin === true;
  if (!isOwner && !isRoot) return NextResponse.json({ error: t.apiForbidden }, { status: 403 });

  const { data: deleted, error } = await admin.from("area_photo_posts").delete().eq("id", id).select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error("photo delete failed", error);
    return NextResponse.json({ error: t.apiDeleteFailed }, { status: 500 });
  }

  // 実ファイルの後片付け(ゴミを残さないため。失敗しても投稿は削除済み)。
  const imageIdx = post.image_url.indexOf(IMAGE_MARKER);
  if (imageIdx >= 0) {
    const path = decodeURIComponent(post.image_url.slice(imageIdx + IMAGE_MARKER.length).split("?")[0]);
    await admin.storage.from("map-photos").remove([path]).catch(() => undefined);
  }
  if (post.video_url && post.video_url.startsWith(`${R2_PUBLIC_BASE_URL}/`)) {
    const r2 = getR2Client();
    if (r2) {
      await r2
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: post.video_url.slice(R2_PUBLIC_BASE_URL.length + 1) }))
        .catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true });
}
