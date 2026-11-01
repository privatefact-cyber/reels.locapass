import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStaticClient } from "@/lib/supabase/static";
import { toReelMedia } from "@/lib/reels/locapassReelMedia";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 現在の位置と、編集画面に出す元の画像のURLを返す(動画はポスター、写真は1枚目)。公開リールなら誰でも読める。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = createStaticClient() as unknown as SupabaseClient;
  const { data } = await db.from("locapass_reels").select("video_url, images, poster_url, thumb_focus_x, thumb_focus_y").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const first = toReelMedia(data)[0];
  const imageUrl = first ? (first.type === "video" ? (first.poster ?? null) : first.url) : null;
  return NextResponse.json(
    { imageUrl, x: data.thumb_focus_x ?? null, y: data.thumb_focus_y ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** そのリールを管理できる人か: 本人のキャスト、店舗のスタッフ/管理者、システム管理者、その店舗のエリア管理者。 */
async function canManageReel(db: SupabaseClient, reel: { cast_id: string | null; shop_id: string | null }): Promise<boolean> {
  if (reel.cast_id) {
    const { data: myCastId } = await db.rpc("locapass_current_cast_id");
    if (myCastId === reel.cast_id) return true;
  }
  if (reel.shop_id) {
    const { data: isStaff } = await db.rpc("locapass_is_shop_staff", { p_shop_id: reel.shop_id });
    if (isStaff === true) return true;
  }
  const { data: isSuper } = await db.rpc("locapass_is_super_admin");
  if (isSuper === true) return true;
  if (reel.shop_id) {
    const { data: shop } = await createAdminClient().from("locapass_shops").select("portal_id").eq("id", reel.shop_id).maybeSingle();
    if (shop?.portal_id != null) {
      const { data: isPortalAdmin } = await db.rpc("locapass_is_portal_admin", { p_portal_id: shop.portal_id });
      if (isPortalAdmin === true) return true;
    }
  }
  return false;
}

/**
 * 一覧タイルに見せる位置を保存する(権限は上のとおり)。
 * body: { x: 0〜100 | null, y: 0〜100 | null }(両方nullで「指定なし(中央)」に戻す)。更新するのはこの2列だけ。
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data: reel } = await admin.from("locapass_reels").select("id, cast_id, shop_id").eq("id", id).maybeSingle();
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canManageReel(supabase as unknown as SupabaseClient, reel))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { x?: unknown; y?: unknown } | null;
  const parse = (v: unknown): number | null | undefined => {
    if (v === null) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return Math.min(100, Math.max(0, Math.round(v)));
  };
  const x = parse(body?.x);
  const y = parse(body?.y);
  if (x === undefined || y === undefined) return NextResponse.json({ error: "invalid position" }, { status: 400 });

  // 更新は、対象が0件でもエラーにならないので、行が返ったかで確かめる。
  const { data, error } = await admin.from("locapass_reels").update({ thumb_focus_x: x, thumb_focus_y: y }).eq("id", id).select("id");
  if (error || !data?.length) return NextResponse.json({ error: error?.message ?? "not found" }, { status: 500 });
  return NextResponse.json({ ok: true, x, y });
}
