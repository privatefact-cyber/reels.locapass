/**
 * shops.translations が無い(または古い)店舗をまとめて翻訳し、JSONに書き出す(DBには書き込まない)。
 * 直接SQLでdescription/business_hours等を書き換えた際に翻訳生成をスキップしていたための、
 * 一括バックフィル用。
 *
 * 使い方: npx tsx scripts/backfill-shop-translations.ts --out /path/to/out.json
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { translateFieldsBatch, needsTranslation } from "../lib/i18n/contentTranslation";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 15;

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  return { out: i >= 0 ? args[i + 1] : join(process.cwd(), "shop-translations.json") };
}

async function main() {
  const { out } = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient<Database>(url, anonKey);

  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, name, description, business_hours, price_info, usage_notes, translations")
    .eq("status", "active")
    .order("name");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const targets = (shops ?? []).filter((s) => {
    if (/サンプル|監視用/.test(s.name)) return false;
    const fields = {
      description: s.description,
      business_hours: s.business_hours,
      price_info: s.price_info,
      usage_notes: s.usage_notes,
    };
    const hasText = Object.values(fields).some((v) => v && v.trim());
    return hasText && needsTranslation(fields, s.translations);
  });

  console.log(`対象: ${targets.length}件`);

  const results: { id: string; name: string; translations: unknown }[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const fieldsBatch = batch.map((s) => ({
      description: s.description,
      business_hours: s.business_hours,
      price_info: s.price_info,
      usage_notes: s.usage_notes,
    }));
    console.log(`翻訳中 ${i + 1}-${i + batch.length}/${targets.length}...`);
    const translated = await translateFieldsBatch(fieldsBatch);
    batch.forEach((s, j) => {
      if (translated[j]) {
        results.push({ id: s.id, name: s.name, translations: translated[j] });
        console.log(`  ✓ ${s.name}`);
      } else {
        console.log(`  ✗ ${s.name} (翻訳失敗)`);
      }
    });
  }

  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n完了: ${results.length}/${targets.length}件 → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
