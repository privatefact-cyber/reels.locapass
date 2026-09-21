/**
 * locapass_shops の紹介文等を Gemini で英語・中国語に翻訳して保存する。
 *
 * 例:
 *   node --import tsx scripts/backfill-locapass-shop-translations.ts --site-id 399
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { translateFieldsBatch, needsTranslation } from "../lib/i18n/contentTranslation";
import type { Database, Json } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 15;

function siteIdArg(): number {
  const args = process.argv.slice(2);
  const index = args.indexOf("--site-id");
  const value = index >= 0 ? Number(args[index + 1]) : 399;
  if (!Number.isInteger(value)) throw new Error("--site-id must be an integer");
  return value;
}

async function main() {
  const siteId = siteIdArg();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.GEMINI_API_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY are required");
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: shops, error } = await supabase
    .from("locapass_shops")
    .select("id, name, description, tagline, business_hours, translations")
    .eq("portal_id", siteId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;

  const targets = (shops ?? []).filter((shop) => {
    const fields = {
      description: shop.description,
      tagline: shop.tagline,
      business_hours: shop.business_hours,
    };
    return Object.values(fields).some((value) => value?.trim()) && needsTranslation(fields, shop.translations);
  });
  console.log(`対象: ${targets.length}件 (portal_id=${siteId})`);

  let updated = 0;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const translated = await translateFieldsBatch(batch.map((shop) => ({
      description: shop.description,
      tagline: shop.tagline,
      business_hours: shop.business_hours,
    })));
    for (let j = 0; j < batch.length; j += 1) {
      const result = translated[j];
      if (!result) {
        console.log(`✗ ${batch[j].name} (翻訳失敗)`);
        continue;
      }
      const { error: updateError } = await supabase
        .from("locapass_shops")
        .update({ translations: result as unknown as Json })
        .eq("id", batch[j].id);
      if (updateError) throw updateError;
      updated += 1;
      console.log(`✓ ${batch[j].name}`);
    }
  }
  console.log(`完了: ${updated}/${targets.length}件`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
