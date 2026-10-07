import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createStaticClient } from "@/lib/supabase/static";
import { ALLOWED_VIDEO_PREFIX, runCaptionPipeline } from "@/lib/reels/captions/pipeline";
import { claimAndRunTags } from "@/lib/reels/tags/pipeline";

// 文字起こし+翻訳は1本10〜20秒ほど。レスポンスを返した後に裏で走らせる(after)。
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 1日(UTC日付)に処理する本数の上限(課金事故を防ぐサーキットブレーカー)。環境変数で変えられる。 */
const DAILY_LIMIT = Number(process.env.CAPTION_DAILY_LIMIT ?? 300);
/** 処理中のまま固まったリールを再処理してよいとみなす時間。 */
const STALE_PENDING_MS = 10 * 60 * 1000;

/** そのリールを投稿/管理できる人か(本人のキャスト、または店舗のスタッフ/管理者)。RLSの書き込み条件と同じ判定。 */
async function canManageReel(
  db: SupabaseClient,
  reel: { cast_id: string | null; shop_id: string | null },
): Promise<boolean> {
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

/** ログイン済みのユーザー+管理できるリールを取り出す(PATCH/DELETE共通)。 */
async function loadManagedReel(id: string) {
  if (!UUID_RE.test(id)) return { error: NextResponse.json({ error: "invalid id" }, { status: 400 }) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const db = supabase as unknown as SupabaseClient;
  const { data: reel } = await db.from("locapass_reels").select("id, cast_id, shop_id").eq("id", id).maybeSingle();
  if (!reel) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (!(await canManageReel(db, reel))) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { db } as const;
}

const MAX_CUE_CHARS = 120;

/**
 * 字幕の文言を直す(投稿者本人/店舗スタッフ)。時刻は変えられず、台詞の件数も変えられない(同じ件数で文言だけ差し替える)。
 * body: { lang: "ja"|"en"|"zh", texts: string[] }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const managed = await loadManagedReel(id);
  if ("error" in managed) return managed.error;
  const { db } = managed;

  const body = (await req.json().catch(() => null)) as { lang?: string; texts?: unknown } | null;
  const lang = body?.lang;
  if (lang !== "ja" && lang !== "en" && lang !== "zh") return NextResponse.json({ error: "invalid lang" }, { status: 400 });
  if (!Array.isArray(body?.texts) || !body.texts.every((t) => typeof t === "string")) {
    return NextResponse.json({ error: "invalid texts" }, { status: 400 });
  }
  const texts = (body.texts as string[]).map((t) => t.trim().slice(0, MAX_CUE_CHARS));

  const { data: row } = await db.from("locapass_reel_captions").select("cues").eq("reel_id", id).eq("lang", lang).maybeSingle();
  const current = Array.isArray(row?.cues) ? (row.cues as { s: number; e: number; t: string }[]) : null;
  if (!current) return NextResponse.json({ error: "no captions" }, { status: 404 });
  if (texts.length !== current.length || texts.some((t) => !t)) {
    return NextResponse.json({ error: "台詞の件数は変えられません。空にもできません" }, { status: 400 });
  }

  const cues = current.map((c, i) => ({ s: c.s, e: c.e, t: texts[i] }));
  const { error } = await db.from("locapass_reel_captions").update({ cues }).eq("reel_id", id).eq("lang", lang);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** 字幕をすべて消す(間違いが多いとき等)。消した後は「声なし」扱いにして、自動では作り直さない。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const managed = await loadManagedReel(id);
  if ("error" in managed) return managed.error;
  const { db } = managed;

  const { error } = await db.from("locapass_reel_captions").delete().eq("reel_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("locapass_reels").update({ caption_status: "no_speech", caption_avoid_zone: "none" }).eq("id", id);
  return NextResponse.json({ ok: true });
}

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
  if (!(await canManageReel(db, reel))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
    // 字幕(文字起こし)ができた後にタグ付けする。文字起こしを手がかりにできるため。声なし・字幕失敗でも画像+キャプションで付ける。
    if (process.env.GEMINI_API_KEY) await claimAndRunTags(db, id);
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

  const cues = Array.isArray(captions.data?.cues) ? captions.data.cues : [];
  return NextResponse.json(
    {
      cues,
      // 動画に焼き込み字幕がある位置(none/top/middle/bottom)。テロップはこれを避けて置く。
      zone: reel.data?.caption_avoid_zone ?? "none",
    },
    {
      headers: {
        // 字幕ができるまでの間に「まだ無い」を長くキャッシュすると、できた後も出なくなる。空の応答はすぐ切れるようにする。
        "Cache-Control":
          cues.length > 0
            ? "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"
            : "public, max-age=0, s-maxage=15",
      },
    },
  );
}
