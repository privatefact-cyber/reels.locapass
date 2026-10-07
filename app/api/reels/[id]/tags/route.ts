import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createStaticClient } from "@/lib/supabase/static";
import { claimAndRunTags } from "@/lib/reels/tags/pipeline";
import { sanitizeTags, tagsForCategory } from "@/lib/reels/tags/vocabulary";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** そのリールを投稿/管理できる人か(本人のキャスト、または店舗のスタッフ/管理者)。RLSの書き込み条件と同じ判定。 */
async function canManageReel(db: SupabaseClient, reel: { cast_id: string | null; shop_id: string | null }): Promise<boolean> {
  if (reel.cast_id) {
    const { data: myCastId } = await db.rpc("locapass_current_cast_id");
    if (myCastId === reel.cast_id) return true;
  }
  if (reel.shop_id) {
    const { data: isStaff } = await db.rpc("locapass_is_shop_staff", { p_shop_id: reel.shop_id });
    if (isStaff === true) return true;
  }
  return false;
}

async function loadManagedReel(id: string) {
  if (!UUID_RE.test(id)) return { error: NextResponse.json({ error: "invalid id" }, { status: 400 }) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const db = supabase as unknown as SupabaseClient;
  const { data: reel } = await db
    .from("locapass_reels")
    .select("id, cast_id, shop_id, reel_type, locapass_shops!locapass_reels_shop_id_fkey ( category )")
    .eq("id", id)
    .maybeSingle();
  if (!reel) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (!(await canManageReel(db, reel))) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { db, reel } as const;
}

/**
 * 画像だけの投稿のタグ付けを依頼する(動画は字幕処理の後ろで自動的に付くので、これは呼ばない)。
 * 投稿者本人か店舗スタッフ/管理者だけが呼べる。同じリールは1回しか処理しない。
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const managed = await loadManagedReel(id);
  if ("error" in managed) return managed.error;
  const { db, reel } = managed;
  if (reel.reel_type === "story") return NextResponse.json({ status: "skipped" });

  after(async () => {
    await claimAndRunTags(db, id);
  });
  return NextResponse.json({ status: "pending" }, { status: 202 });
}

/**
 * タグを直す(投稿者本人/店舗スタッフ)。辞書にあるタグだけ・最大4つ。AIが付けたものを後から直せる。
 * body: { tags: string[] }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const managed = await loadManagedReel(id);
  if ("error" in managed) return managed.error;
  const { db, reel } = managed;

  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null;
  if (!Array.isArray(body?.tags)) return NextResponse.json({ error: "invalid tags" }, { status: 400 });
  const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
  const tags = sanitizeTags(body.tags, tagsForCategory((shop as { category?: string } | null)?.category));

  const { error } = await db
    .from("locapass_reels")
    .update({ tags, tags_status: "ready", tags_generated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tags });
}

/** タグと、そのリールで選べるタグID一覧を返す(編集画面が呼ぶ)。公開リールなら誰でも読める。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ tags: [], allowed: [] }, { status: 400 });
  const db = createStaticClient() as unknown as SupabaseClient;
  const { data: reel } = await db
    .from("locapass_reels")
    .select("tags, tags_status, locapass_shops!locapass_reels_shop_id_fkey ( category )")
    .eq("id", id)
    .maybeSingle();
  const shop = Array.isArray(reel?.locapass_shops) ? reel?.locapass_shops[0] : reel?.locapass_shops;
  return NextResponse.json(
    {
      tags: reel?.tags ?? [],
      status: reel?.tags_status ?? null,
      allowed: tagsForCategory((shop as { category?: string } | null)?.category).map((t) => t.id),
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15" } },
  );
}
