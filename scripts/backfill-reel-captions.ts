/**
 * 字幕が付いていない既存の動画リールに、字幕(文字起こし+英語・中国語)を一括で付ける。
 *
 * 使い方:
 *   npx tsx scripts/backfill-reel-captions.ts --dry-run     # 対象の一覧だけ表示(何も呼ばない・書かない)
 *   npx tsx scripts/backfill-reel-captions.ts --limit 5     # 5本だけ試す
 *   npx tsx scripts/backfill-reel-captions.ts               # 対象すべて(上限 --limit 既定100)
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GEMINI_API_KEY
 *
 * 対象: reel_type='permanent' かつ video_url がR2(media.locapass.net)で、caption_status が未設定または failed のリール。
 * 費用の目安: 1本あたり約0.1〜0.15円。1本ずつ順番に処理し、声のない動画は「声なし」として印を付けて終わる。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { ALLOWED_VIDEO_PREFIX, runCaptionPipeline } from "../lib/reels/captions/pipeline";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");
const limit = Number(arg("--limit") ?? 100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  if (!dryRun && !process.env.GROQ_API_KEY) throw new Error(".env.local に GROQ_API_KEY が必要です");

  const db = createClient(url, serviceKey);
  const { data, error } = await db
    .from("locapass_reels")
    .select("id, video_url, poster_url, caption_status, locapass_shops!locapass_reels_shop_id_fkey ( name )")
    .eq("reel_type", "permanent")
    .eq("status", "publish")
    .like("video_url", `${ALLOWED_VIDEO_PREFIX}%`)
    .or("caption_status.is.null,caption_status.eq.failed")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const reels = data ?? [];
  console.log(`対象 ${reels.length} 本${dryRun ? "(dry-run: 何も実行しません)" : ""}`);

  let ready = 0;
  let noSpeech = 0;
  let failed = 0;
  for (const reel of reels) {
    const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
    const label = `${reel.id.slice(0, 8)} ${(shop as { name?: string } | null)?.name ?? ""}`;
    if (dryRun) {
      console.log(`- ${label}`);
      continue;
    }
    await runCaptionPipeline(db, {
      id: reel.id,
      video_url: reel.video_url as string,
      poster_url: reel.poster_url,
      shopName: (shop as { name?: string } | null)?.name ?? null,
    });
    const { data: after } = await db.from("locapass_reels").select("caption_status").eq("id", reel.id).maybeSingle();
    const status = after?.caption_status ?? "?";
    if (status === "ready") ready++;
    else if (status === "no_speech") noSpeech++;
    else failed++;
    console.log(`- ${label} → ${status}`);
    await sleep(1200); // Groq/Geminiのレート制限に当たらないよう間隔を空ける
  }

  if (!dryRun) console.log(`\n完了: 字幕あり ${ready} / 声なし ${noSpeech} / 失敗 ${failed}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
