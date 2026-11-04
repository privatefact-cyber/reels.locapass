/**
 * locapass_shops の鮮度を更新する手動実行用スクリプト(本体は lib/shop/freshnessCheck.ts。毎週のcronも同じ処理)。
 *
 * 使い方:
 *   npx tsx scripts/check-shop-freshness.ts --dry-run --out /tmp/fresh.json   # 書き込まず結果確認
 *   npx tsx scripts/check-shop-freshness.ts                                    # 実際に更新
 *   npx tsx scripts/check-shop-freshness.ts --portal shibuya                   # 特定ポータルのみ
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { runShopFreshnessCheck } from "../lib/shop/freshnessCheck";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const outPath = arg("--out");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { targets, tally, results } = await runShopFreshnessCheck(supabase, { dryRun, onlyPortal: arg("--portal") });
  console.log(`対象 ${targets} 店舗${dryRun ? " (dry-run)" : ""}`);
  console.log("URL確認の内訳:", tally);
  console.log(`更新${dryRun ? "予定" : ""} ${results.length} 店舗`);
  if (outPath) writeFileSync(outPath, JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
