/**
 * 住所の英語表記(locapass_shops.address_en)を一括生成するスクリプト。
 * scripts/translate-addresses.ts(旧shopsテーブル用)のlocapass_shops版。
 *
 * 使い方:
 *   npx tsx scripts/translate-locapass-shop-addresses.ts --dry-run
 *   npx tsx scripts/translate-locapass-shop-addresses.ts
 *   npx tsx scripts/translate-locapass-shop-addresses.ts --force
 *   npx tsx scripts/translate-locapass-shop-addresses.ts --out /tmp/en.json
 *
 * .env.local に SUPABASE_SERVICE_ROLE_KEY と GEMINI_API_KEY が必要。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { translateAddressesToEnglish } from "../lib/map/translateAddress";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 20;

function parseArgs() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    out: outIndex >= 0 ? args[outIndex + 1] : undefined,
  };
}

function connect() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
    process.exit(1);
  }
  return createClient<Database>(url, serviceKey);
}

async function main() {
  const { dryRun, force, out } = parseArgs();
  const supabase = connect();

  let query = supabase
    .from("locapass_shops")
    .select("id, name, address, address_en")
    .eq("status", "active")
    .not("address", "is", null)
    .order("name");

  if (!force) query = query.is("address_en", null);

  const { data, error } = await query;
  if (error) {
    console.error("店舗の取得に失敗しました:", error.message);
    process.exit(1);
  }

  const targets = (data ?? []).filter((s) => (s.address ?? "").trim() !== "");
  console.log(`対象: ${targets.length}件${dryRun ? " (dry-run: 書き込みません)" : ""}`);
  if (targets.length === 0) return;

  const results: { id: string; name: string; address: string; addressEn: string }[] = [];
  let failed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const translated = await translateAddressesToEnglish(batch.map((s) => (s.address ?? "").trim()));

    for (const [j, shop] of batch.entries()) {
      const addressEn = translated[j];
      if (!addressEn) {
        failed += 1;
        console.log(`  ✗ ${shop.name} … 生成できず`);
        continue;
      }

      if (!dryRun) {
        const { error: updateError, data: updated } = await supabase
          .from("locapass_shops")
          .update({ address_en: addressEn })
          .eq("id", shop.id)
          .select("id");
        if (updateError || !updated?.length) {
          failed += 1;
          console.log(`  ✗ ${shop.name} … 更新失敗 ${updateError?.message ?? "0件"}`);
          continue;
        }
      }

      results.push({ id: shop.id, name: shop.name, address: shop.address ?? "", addressEn });
      console.log(`  ✓ ${shop.name} … ${addressEn}`);
    }
    console.log(`[${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}]`);
  }

  if (out) {
    writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`\n結果を書き出しました: ${out}`);
  }
  console.log(`\n完了: ${dryRun ? "生成" : "更新"} ${results.length}件 / 失敗 ${failed}件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
