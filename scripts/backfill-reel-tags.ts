/**
 * タグが付いていない既存のリール(動画・写真)に、AIでタグを一括で付ける。
 *
 * 使い方:
 *   npx tsx scripts/backfill-reel-tags.ts --dry-run     # 対象の一覧だけ表示(何も呼ばない・書かない)
 *   npx tsx scripts/backfill-reel-tags.ts --limit 5     # 5本だけ試す
 *   npx tsx scripts/backfill-reel-tags.ts               # 対象すべて(上限 --limit 既定200)
 *   npx tsx scripts/backfill-reel-tags.ts --retag       # 処理済みも含めて付け直す(投稿者が直したタグも上書きされるので注意)
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 *
 * 対象: reel_type='permanent' かつ公開中で、tags_status が未設定または failed のリール。
 * 動画は字幕の文字起こしがあればそれも手がかりにする(先に backfill-reel-captions.ts を回すと精度が上がる)。
 * 費用の目安: 1本あたり約0.1円。1本ずつ順番に処理する。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { claimAndRunTags } from "../lib/reels/tags/pipeline";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");
const retag = process.argv.includes("--retag");
const limit = Number(arg("--limit") ?? 200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  if (!dryRun && !process.env.GEMINI_API_KEY) throw new Error(".env.local に GEMINI_API_KEY が必要です");

  const db = createClient(url, serviceKey);
  let query = db
    .from("locapass_reels")
    .select("id, tags_status, locapass_shops!locapass_reels_shop_id_fkey ( name )")
    .eq("reel_type", "permanent")
    .eq("status", "publish")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (!retag) query = query.or("tags_status.is.null,tags_status.eq.failed");
  const { data, error } = await query;
  if (error) throw error;

  const reels = data ?? [];
  console.log(`対象 ${reels.length} 本${dryRun ? "(dry-run: 何も実行しません)" : ""}`);

  let done = 0;
  let other = 0;
  for (const reel of reels) {
    const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
    const label = `${reel.id.slice(0, 8)} ${(shop as { name?: string } | null)?.name ?? ""}`;
    if (dryRun) {
      console.log(`- ${label}`);
      continue;
    }
    const result = await claimAndRunTags(db, reel.id, { force: retag });
    const { data: after } = await db.from("locapass_reels").select("tags").eq("id", reel.id).maybeSingle();
    if (result === "done") done++;
    else other++;
    console.log(`- ${label} → ${result} [${(after?.tags ?? []).join(", ")}]`);
    await sleep(800); // Geminiのレート制限に当たらないよう間隔を空ける
  }

  if (!dryRun) console.log(`\n完了: 付与 ${done} / それ以外 ${other}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
