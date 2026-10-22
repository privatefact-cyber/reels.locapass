import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { refreshReelTranslation } from "@/lib/reels/reelTranslations";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 投稿直後に、そのリールの投稿文の翻訳を頼む。投稿者本人か店舗スタッフ/管理者だけが呼べる。裏で処理する。 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabase as unknown as SupabaseClient;
  const { data: reel } = await db.from("locapass_reels").select("id, cast_id, shop_id").eq("id", id).maybeSingle();
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });

  let allowed = false;
  if (reel.cast_id) {
    const { data: myCastId } = await db.rpc("locapass_current_cast_id");
    allowed = myCastId === reel.cast_id;
  }
  if (!allowed && reel.shop_id) {
    const { data: isStaff } = await db.rpc("locapass_is_shop_staff", { p_shop_id: reel.shop_id });
    allowed = isStaff === true;
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  after(async () => {
    await refreshReelTranslation(db, id);
  });
  return NextResponse.json({ status: "pending" }, { status: 202 });
}
