import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createStaticClient } from "@/lib/supabase/static";
import { ALLOWED_VIDEO_PREFIX, runCaptionPipeline } from "@/lib/reels/captions/pipeline";

// 文字起こし+翻訳は1本10〜20秒ほど。レスポンスを返した後に裏で走らせる(after)。
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 1日(UTC日付)に処理する本数の上限(課金事故を防ぐサーキットブレーカー)。環境変数で変えられる。 */
const DAILY_LIMIT = Number(process.env.CAPTION_DAILY_LIMIT ?? 300);
/** 処理中のまま固まったリールを再処理してよいとみなす時間。 */
const STALE_PENDING_MS = 10 * 60 * 1000;

/**
 * 字幕の生成を依頼する(投稿直後に投稿フォームから呼ぶ)。
 *   - 投稿者本人(キャスト)か、その店舗のスタッフ/管理者だけが呼べる。誰でも叩ける公開APIにはしない。
 *   - 同じリールは1回しか処理しない(処理中・完了・声なしは再処理しない)。
 *   - 1日の上限(DAILY_LIMIT)を超えたら処理しない。
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabase as unknown as SupabaseClient;

  const { data: reel } = await db
    .from("locapass_reels")
    .select("id, video_url, poster_url, cast_id, shop_id, reel_type, caption_status, captions_generated_at, locapass_shops!locapass_reels_shop_id_fkey ( name )")
    .eq("id", id)
    .maybeSingle();
  if (!reel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!reel.video_url || reel.reel_type === "story") return NextResponse.json({ status: "skipped" });

  // 投稿者本人か店舗スタッフか(RLSの書き込み条件と同じ判定を、Groqを呼ぶ前にやる)。
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

  if (reel.caption_status === "ready" || reel.caption_status === "no_speech") {
    return NextResponse.json({ status: reel.caption_status });
  }
  if (!reel.video_url.startsWith(ALLOWED_VIDEO_PREFIX)) return NextResponse.json({ status: "skipped" });

  // 1日の上限。
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("locapass_reels")
    .select("id", { count: "exact", head: true })
    .gte("captions_generated_at", startOfDay.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) {
    console.error("[captions] daily limit reached", DAILY_LIMIT);
    return NextResponse.json({ status: "capped" }, { status: 429 });
  }

  // 処理権を確保する(同時に2回呼ばれても1回しか動かさない)。未処理・失敗・固まった処理中だけ取れる。
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data: claimed } = await db
    .from("locapass_reels")
    .update({ caption_status: "pending", captions_generated_at: new Date().toISOString() })
    .eq("id", id)
    .or(`caption_status.is.null,caption_status.eq.failed,and(caption_status.eq.pending,captions_generated_at.lt.${staleBefore})`)
    .select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ status: "pending" });

  const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
  after(async () => {
    await runCaptionPipeline(db, {
      id,
      video_url: reel.video_url as string,
      poster_url: reel.poster_url,
      shopName: (shop as { name?: string } | null)?.name ?? null,
    });
  });

  return NextResponse.json({ status: "pending" }, { status: 202 });
}

/**
 * 字幕を返す(再生画面が呼ぶ)。?lang=ja|en|zh。公開されているリールなら誰でも読める(RLSがそのまま効く)。
 * CDNに5分キャッシュさせ、再生のたびに関数が動かないようにする。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ cues: [] }, { status: 400 });
  const lang = new URL(req.url).searchParams.get("lang");
  if (lang !== "ja" && lang !== "en" && lang !== "zh") return NextResponse.json({ cues: [] }, { status: 400 });

  const db = createStaticClient() as unknown as SupabaseClient;
  const [captions, reel] = await Promise.all([
    db.from("locapass_reel_captions").select("cues").eq("reel_id", id).eq("lang", lang).maybeSingle(),
    db.from("locapass_reels").select("caption_avoid_zone").eq("id", id).maybeSingle(),
  ]);

  return NextResponse.json(
    {
      cues: Array.isArray(captions.data?.cues) ? captions.data.cues : [],
      // 動画に焼き込み字幕がある位置(none/top/middle/bottom)。テロップはこれを避けて置く。
      zone: reel.data?.caption_avoid_zone ?? "none",
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
