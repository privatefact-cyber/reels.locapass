/**
 * 既存のリール(動画・写真)に、文章検索用のデータ(要約・キーワード・意味ベクトル)を一括で作る。
 *
 * 使い方:
 *   npx tsx scripts/backfill-reel-search.ts --dry-run     # 対象の件数と一覧だけ表示(何も呼ばない・書かない)
 *   npx tsx scripts/backfill-reel-search.ts --limit 5     # 5本だけ試す
 *   npx tsx scripts/backfill-reel-search.ts               # 対象すべて(上限 --limit 既定2000)
 *   npx tsx scripts/backfill-reel-search.ts --redo        # 作成済みも含めて作り直す
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 *
 * 対象: reel_type='permanent' で、検索データがまだ無いリール(公開中のものだけ。ダミー投稿は除く)。
 * タグ(tags)は、すでに処理済み(投稿者が直した分を含む)なら上書きしない。未処理のときだけ付ける。
 * 費用の目安: 1本あたり約0.1円(分類) + 意味ベクトル(ごく微小)。1本ずつ順番に処理する。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { classifyReel } from "../lib/reels/tags/classify";
import { saveReelSearch } from "../lib/reels/search";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");
const redo = process.argv.includes("--redo");
const limit = Number(arg("--limit") ?? 2000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  if (!dryRun && !process.env.GEMINI_API_KEY) throw new Error(".env.local に GEMINI_API_KEY が必要です");

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1回の取得は500件が上限なので、ページに分けて集める。
  const rows: Array<{
    id: string;
    shop_id: string | null;
    video_url: string | null;
    poster_url: string | null;
    images: unknown;
    caption: string | null;
    tags_status: string | null;
    locapass_shops: unknown;
  }> = [];
  for (let from = 0; rows.length < limit; from += 500) {
    const { data, error } = await db
      .from("locapass_reels")
      .select("id, shop_id, video_url, poster_url, images, caption, tags_status, locapass_shops!locapass_reels_shop_id_fkey ( name, category )")
      .eq("reel_type", "permanent")
      .eq("status", "publish")
      .eq("is_placeholder", false)
      .order("published_at", { ascending: false })
      .range(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }

  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data: existing } = await db.from("locapass_reel_search").select("reel_id").range(from, from + 999);
    for (const r of existing ?? []) done.add((r as { reel_id: string }).reel_id);
    if ((existing?.length ?? 0) < 1000) break;
  }
  const targets = rows.slice(0, limit).filter((r) => redo || !done.has(r.id));
  console.log(`公開リール ${rows.length} 本 / 作成済み ${done.size} 本 / 対象 ${targets.length} 本${dryRun ? "(dry-run: 何も実行しません)" : ""}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const reel of targets) {
    const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
    const s = shop as { name?: string; category?: string } | null;
    const label = `${reel.id.slice(0, 8)} ${s?.name ?? ""}`;
    if (dryRun) {
      console.log(`- ${label}`);
      continue;
    }
    try {
      const images = (reel.images as { url: string }[] | null) ?? [];
      const { data: capRows } = await db.from("locapass_reel_captions").select("lang, cues").eq("reel_id", reel.id);
      const capRow = capRows?.find((r) => r.lang === "ja") ?? capRows?.[0];
      const transcript = Array.isArray(capRow?.cues) ? (capRow.cues as { t: string }[]).map((c) => c.t).join("\n") : null;

      const classified = await classifyReel({
        imageUrl: reel.video_url ? reel.poster_url : (images[0]?.url ?? reel.poster_url),
        caption: reel.caption,
        transcript,
        shopName: s?.name ?? null,
        category: s?.category ?? null,
      });

      // タグは、未処理のときだけ付ける(投稿者が直した分は守る)。
      if (reel.tags_status !== "ready" && classified.tags.length > 0) {
        await db.from("locapass_reels").update({ tags: classified.tags, tags_status: "ready", tags_generated_at: new Date().toISOString() }).eq("id", reel.id);
      }
      const saved = await saveReelSearch({ reelId: reel.id, shopId: reel.shop_id ?? null, classified, caption: reel.caption });
      if (saved) ok++;
      else skipped++;
      console.log(`- ${label} → ${saved ? "作成" : "材料なし"} [${classified.keywords.join("、")}] ${classified.summary}`);
    } catch (e) {
      failed++;
      console.error(`- ${label} → 失敗`, e instanceof Error ? e.message : e);
    }
    await sleep(800); // Geminiのレート制限に当たらないよう間隔を空ける
  }
  if (!dryRun) console.log(`\n完了: 作成 ${ok} / 材料なし ${skipped} / 失敗 ${failed}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
