import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMyRoles } from "@/lib/auth/roles";
import { photoText } from "@/lib/photo/serverText";
import { R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/**
 * 動画のダウンロード。ダウンロードできるのは、投稿した本人とルート管理者(super_admin)だけ。
 * 動画の本体は公開URL(R2)にあるが、ここで本人確認をしてから、保存用(Content-Disposition: attachment)の
 * 応答として動画をそのまま流す(ためずに少しずつ中継する)。画面のボタンの出し分けは見た目だけで、権限の確認はここで行う。
 * 動画のURLはDBの値を使い、R2の公開URLのものだけを中継する(ブラウザから届いたURLは使わない)。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await photoText();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: t.apiBadInput }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  const admin = createAdminClient();
  const { data: post } = await admin.from("area_photo_posts").select("id, member_id, video_url, created_at").eq("id", id).maybeSingle();
  if (!post || !post.video_url) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  const isOwner = post.member_id === user.id;
  const isRoot = isOwner ? false : (await fetchMyRoles(supabase))?.super_admin === true;
  if (!isOwner && !isRoot) return NextResponse.json({ error: t.apiForbidden }, { status: 403 });

  if (!post.video_url.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });
  const upstream = await fetch(post.video_url).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) return NextResponse.json({ error: t.apiNotFound }, { status: 404 });

  const ext = (post.video_url.match(/\.(mp4|mov|webm)(\?|$)/i)?.[1] ?? "mp4").toLowerCase();
  const day = new Date(post.created_at).toISOString().slice(0, 10);
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="locapass-${day}-${id.slice(0, 8)}.${ext}"`,
    "Cache-Control": "private, no-store",
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;
  return new Response(upstream.body, { headers });
}
