/**
 * shop_price_items.name_translations が無い項目をまとめて翻訳し、JSONに書き出す(DBには書き込まない)。
 * 使い方: npx tsx scripts/backfill-price-item-translations.ts --out /path/to/out.json
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { translatePriceItemNames } from "../lib/shop/shopTranslations";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 40;

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  return { out: i >= 0 ? args[i + 1] : join(process.cwd(), "price-item-translations.json") };
}

async function main() {
  const { out } = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient<Database>(url, anonKey);

  const { data: items, error } = await supabase
    .from("shop_price_items")
    .select("id, name, name_translations")
    .order("id");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const targets = (items ?? []).filter((i) => {
    const t = i.name_translations;
    return !t || (typeof t === "object" && Object.keys(t).length === 0);
  });

  console.log(`対象: ${targets.length}件`);

  const results: { id: string; name: string; translations: unknown }[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    console.log(`翻訳中 ${i + 1}-${i + batch.length}/${targets.length}...`);
    const translated = await translatePriceItemNames(batch.map((b) => b.name));
    batch.forEach((b, j) => {
      results.push({ id: b.id, name: b.name, translations: translated[j] ?? {} });
    });
  }

  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n完了: ${results.length}件 → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
