/**
 * 翻訳がまだ無い投稿写真(area_photo_posts)の、場所名・一言・住所を英語・中国語・アラビア語に訳して保存する。
 *
 * 使い方:
 *   npx tsx scripts/backfill-photo-translations.ts --dry-run   # 件数だけ確認(翻訳しない)
 *   npx tsx scripts/backfill-photo-translations.ts             # 実際に翻訳して保存
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 * すでに翻訳が最新の投稿(翻訳元のハッシュが一致し、3言語そろっているもの)は飛ばす。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { needsTranslation, translateFieldsBatch } from "../lib/i18n/contentTranslation";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const BATCH = 5;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from("area_photo_posts")
    .select("id, spot_name, comment, address, translations")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const targets = (rows ?? []).filter((r) =>
    needsTranslation({ spot_name: r.spot_name, comment: r.comment, address: r.address }, r.translations),
  );
  console.log(`翻訳が必要な投稿: ${targets.length} / ${rows?.length ?? 0}${dryRun ? " (dry-run)" : ""}`);
  if (dryRun) return;

  let ok = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const results = await translateFieldsBatch(
      chunk.map((r) => ({ spot_name: r.spot_name, comment: r.comment, address: r.address })),
    );
    for (let j = 0; j < chunk.length; j++) {
      const tr = results[j];
      if (!tr) {
        console.log(`SKIP ${chunk[j].id} (翻訳の応答が不完全)`);
        continue;
      }
      const { error: upErr } = await supabase.from("area_photo_posts").update({ translations: tr as never }).eq("id", chunk[j].id);
      if (upErr) throw upErr;
      ok++;
    }
    console.log(`  ${Math.min(i + BATCH, targets.length)} / ${targets.length}`);
  }
  console.log(`完了: ${ok} 件を翻訳して保存`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
