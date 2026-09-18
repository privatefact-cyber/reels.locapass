/**
 * 住所の英語表記(shops.address_en)を一括生成するスクリプト。
 *
 * 使い方:
 *   npx tsx scripts/translate-addresses.ts --dry-run    # 生成結果を表示するだけ
 *   npx tsx scripts/translate-addresses.ts              # DBに保存する
 *   npx tsx scripts/translate-addresses.ts --force      # 既にaddress_enがある店舗も作り直す
 *   npx tsx scripts/translate-addresses.ts --out /tmp/en.json
 *
 * 店長には日本語住所だけを入力してもらう運用なので、英語表記はここで裏から補う。
 * マップ検索(/api/venues/search)が "shinjuku" のようなローマ字入力を拾うのに使う。
 *
 * 書き込みには運営権限が要る(全店舗が対象のため)。.env.local に
 * SUPABASE_SERVICE_ROLE_KEY か、PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD を置くこと。
 * 翻訳には GEMINI_API_KEY を使う。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { translateAddressesToEnglish } from "../lib/map/translateAddress";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

/** 1回のAPI呼び出しで送る件数。多すぎると応答が崩れるので控えめにする。 */
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

async function connect(readOnly: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL が必要です");
    process.exit(1);
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return createClient<Database>(url, serviceKey);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (readOnly && anonKey) return createClient<Database>(url, anonKey);

  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!anonKey || !email || !password) {
    console.error(
      ".env.local に SUPABASE_SERVICE_ROLE_KEY、もしくは " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY + PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD が必要です",
    );
    process.exit(1);
  }
  const supabase = createClient<Database>(url, anonKey);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`運営者アカウントのログインに失敗しました: ${error.message}`);
    process.exit(1);
  }
  return supabase;
}

async function main() {
  const { dryRun, force, out } = parseArgs();
  const supabase = await connect(dryRun);

  let query = supabase
    .from("shops")
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
          .from("shops")
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
