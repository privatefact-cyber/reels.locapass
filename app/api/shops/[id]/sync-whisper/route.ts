import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isFresh, syncSingleShopWhisper } from "@/lib/streetWhispers/pipeline";

// 収集(検索+蒸留)は1店舗あたり10秒前後。裏で走らせる分もこの時間内に収める。
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 街の声: 1店舗の噂ネタをオンデマンドで更新する(Stale-While-Revalidate)。
 *   - 店舗ページの表示時やコンシェルジュが店を提案したときに呼ばれる。今DBにある噂をすぐ返し、
 *     古ければ(最後に調べてから3日以上)更新は裏で走らせる(呼び出し側を待たせない)。
 *   - 誰でも呼べるので、課金事故を防ぐガードはすべてサーバー側で行う:
 *       ・3日以内に調べた店は調べ直さない(情報が無かった店も含む)。同時に来ても予約で1本に絞る。
 *       ・1日の上限(DAILY_WHISPER_UPDATE_LIMIT、両サイト合計)に達したら更新しない。
 *       ・街の声ベータがオフの間は、一般からの呼び出しでは更新しない。
 *   - body に {"force": true} を付けた強制更新はスーパー管理者だけ。こちらは結果を待って返す。
 *   - サーバーに SUPABASE_SERVICE_ROLE_KEY が無い環境では何もしない(503)。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid shop id" }, { status: 400 });

  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // body無しは通常の(非強制の)呼び出し
  }

  if (force) {
    // 強制更新はlocapassのスーパー管理者だけ。
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("locapass_is_super_admin");
    if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: shop, error } = await admin
    .from("locapass_shops")
    .select("id, sns_whisper, sns_whisper_checked_at, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shop || shop.status !== "active") return NextResponse.json({ error: "not found" }, { status: 404 });

  if (force) {
    const result = await syncSingleShopWhisper(admin, "locapass", id, { force: true });
    return NextResponse.json({
      status: result.status,
      whisper: "whisper" in result ? result.whisper : null,
      ...(result.status === "failed" ? { error: result.error } : {}),
    });
  }

  if (isFresh(shop.sns_whisper_checked_at)) {
    return NextResponse.json({ status: "fresh", whisper: shop.sns_whisper });
  }

  const { data: settings } = await admin
    .from("platform_settings")
    .select("locapass_machi_no_koe_beta_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.locapass_machi_no_koe_beta_enabled) {
    return NextResponse.json({ status: "disabled", whisper: shop.sns_whisper });
  }

  // 古い: 今の噂をすぐ返し、更新はレスポンス後に裏で行う(上限・同時実行のチェックはこの中)。
  after(async () => {
    const result = await syncSingleShopWhisper(admin, "locapass", id);
    if (result.status === "failed") console.error("sync-whisper failed", id, result.error);
  });
  return NextResponse.json({ status: "queued", whisper: shop.sns_whisper });
}
