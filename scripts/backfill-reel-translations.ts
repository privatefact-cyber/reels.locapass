/**
 * 公開中リールの投稿文(caption)を英語・中国語・アラビア語に翻訳して locapass_reels.translations に保存する。
 * 日本語が変わっていないものはスキップするので、何度実行しても安全。
 *
 *   node --import tsx scripts/backfill-reel-translations.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { translateFieldsBatch, needsTranslation } from "../lib/i18n/contentTranslation";
import type { Database, Json } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 5;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.GEMINI_API_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY are required");
  }
  const supabase = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: reels, error } = await supabase.from("locapass_reels").select("id, caption, translations").not("caption", "is", null);
  if (error) throw error;
  const targets = (reels ?? []).filter((r) => r.caption?.trim() && needsTranslation({ caption: r.caption }, r.translations));
  console.log(`対象: ${targets.length}件`);

  let updated = 0;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const translated = await translateFieldsBatch(batch.map((r) => ({ caption: r.caption })));
    for (let j = 0; j < batch.length; j += 1) {
      const result = translated[j];
      if (!result) {
        console.log(`✗ ${batch[j].id} (翻訳失敗)`);
        continue;
      }
      const { error: updateError } = await supabase.from("locapass_reels").update({ translations: result as unknown as Json }).eq("id", batch[j].id);
      if (updateError) throw updateError;
      updated += 1;
    }
    console.log(`進捗 ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}`);
  }
  console.log(`完了: ${updated}/${targets.length}件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
