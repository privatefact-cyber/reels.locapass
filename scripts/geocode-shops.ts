/**
 * 店舗の住所から緯度経度を求めて、DBの座標を正規の値に更新する一括スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/geocode-shops.ts --dry-run     # 何も書き込まず結果だけ表示
 *   npx tsx scripts/geocode-shops.ts               # 実際に更新する
 *   npx tsx scripts/geocode-shops.ts --force       # manual(手動調整済み)も含めて上書きする
 *   npx tsx scripts/geocode-shops.ts --limit 10    # 先頭N件だけ処理(試し打ち用)
 *   npx tsx scripts/geocode-shops.ts --dry-run --out /tmp/geo.json   # 結果をJSONに書き出す
 *
 * 対象: status='active' かつ住所があり、geocode_source が 'address'/'manual' でない店舗。
 *   - 'manual'  … 管理画面で人が確定させた座標。--force を付けない限り触らない。
 *   - 'address' … 既にこのスクリプトで解決済み。再実行時はスキップ(--forceで再取得)。
 *
 * ジオコーダはGSI(国土地理院)→Nominatim(OSM)の順。どちらも無料枠なので
 * 1件ごとに間隔を空けて叩く(Nominatimの利用規約は1req/秒)。
 *
 * 接続には運営権限が要る(全店舗を更新するため)。.env.local に
 * SUPABASE_SERVICE_ROLE_KEY か、PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD を置くこと。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { geocodeAddress, extractBuilding } from "../lib/map/addressGeocode";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

/** ジオコーダへの問い合わせ間隔(ms)。Nominatimの1req/秒に合わせて余裕を持たせる。 */
const REQUEST_INTERVAL_MS = 1200;

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf("--limit");
  const outIndex = args.indexOf("--out");
  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    limit: limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined,
    /** 結果をJSONで書き出すパス(適用前の確認や、別経路での反映に使う)。 */
    out: outIndex >= 0 ? args[outIndex + 1] : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 全店舗を更新する必要があるので、店舗スタッフではなく運営権限で接続する。
 * SUPABASE_SERVICE_ROLE_KEY があればそれを使い、無ければ運営者アカウントでログインする
 * (shopsには「platform admin update all shops」ポリシーがあるためRLS経由でも更新できる)。
 */
async function connect(readOnly: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL が必要です");
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return createClient<Database>(url, serviceKey);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // dry-runは書き込まないので、公開中の店舗を読めるanonキーだけで動かせる。
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
  const { dryRun, force, limit, out } = parseArgs();

  const supabase = await connect(dryRun);

  let query = supabase
    .from("shops")
    .select("id, name, address, lat, lng, geocode_source")
    .eq("status", "active")
    .not("address", "is", null)
    .order("name");

  if (!force) {
    // 既に住所から求めた座標・手動で直した座標には触らない。
    query = query.or("geocode_source.is.null,geocode_source.eq.area_fallback");
  }

  const { data: shops, error } = await query;
  if (error) {
    console.error("店舗の取得に失敗しました:", error.message);
    process.exit(1);
  }

  const targets = (shops ?? []).filter((s) => (s.address ?? "").trim() !== "").slice(0, limit);
  console.log(
    `対象: ${targets.length}件${dryRun ? " (dry-run: 書き込みません)" : ""}${force ? " (force: manualも上書き)" : ""}`,
  );

  let updated = 0;
  let failed = 0;
  const failures: { name: string; address: string }[] = [];
  const results: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    buildingName?: string;
    floor?: string;
    matched?: string;
    provider: string;
  }[] = [];

  for (const [i, shop] of targets.entries()) {
    const address = (shop.address ?? "").trim();
    const hit = await geocodeAddress(address);

    if (!hit) {
      failed += 1;
      failures.push({ name: shop.name, address });
      console.log(`[${i + 1}/${targets.length}] ✗ ${shop.name} … 解決できず (${address})`);
      await sleep(REQUEST_INTERVAL_MS);
      continue;
    }

    const { buildingName, floor } = extractBuilding(address);
    const patch = {
      lat: hit.lat,
      lng: hit.lng,
      geocode_source: "address" as const,
      geocoded_at: new Date().toISOString(),
      ...(buildingName ? { building_name: buildingName } : {}),
      ...(floor ? { floor } : {}),
    };

    if (!dryRun) {
      const { error: updateError, data: updatedRows } = await supabase
        .from("shops")
        .update(patch)
        .eq("id", shop.id)
        .select("id");
      if (updateError || !updatedRows?.length) {
        failed += 1;
        failures.push({ name: shop.name, address });
        console.log(`[${i + 1}/${targets.length}] ✗ ${shop.name} … 更新失敗 ${updateError?.message ?? "0件"}`);
        await sleep(REQUEST_INTERVAL_MS);
        continue;
      }
    }

    results.push({
      id: shop.id,
      name: shop.name,
      lat: hit.lat,
      lng: hit.lng,
      buildingName,
      floor,
      matched: hit.matched,
      provider: hit.provider,
    });

    updated += 1;
    console.log(
      `[${i + 1}/${targets.length}] ✓ ${shop.name} → ${hit.lat.toFixed(6)},${hit.lng.toFixed(6)}` +
        ` [${hit.provider}] ${hit.matched ?? ""}${buildingName ? ` / ${buildingName}${floor ?? ""}` : ""}`,
    );

    await sleep(REQUEST_INTERVAL_MS);
  }

  if (out) {
    writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`\n結果を書き出しました: ${out}`);
  }

  console.log(`\n完了: ${dryRun ? "解決" : "更新"} ${updated}件 / 失敗 ${failed}件`);
  if (failures.length) {
    console.log("\n解決できなかった店舗(管理画面から手動でピンを設定してください):");
    for (const f of failures) console.log(`  - ${f.name} … ${f.address}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
