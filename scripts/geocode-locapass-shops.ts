/**
 * locapass_shops の座標(lat/lng)が空の店舗を、住所から求めて埋める一括スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/geocode-locapass-shops.ts --dry-run --out /tmp/geo.json   # 書き込まず結果確認
 *   npx tsx scripts/geocode-locapass-shops.ts                                  # 実際に更新
 *   npx tsx scripts/geocode-locapass-shops.ts --portal shibuya                 # 特定ポータルのみ
 *
 * 対象: status='active' で、住所があり lat/lng が空の店舗(既存の座標は触らない)。
 * ジオコーダはGSI(国土地理院)→Nominatim(OSM)。1件ごとに間隔を空けて叩く。
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { geocodeAddress } from "../lib/map/addressGeocode";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const REQUEST_INTERVAL_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const onlyPortal = arg("--portal");
const outPath = arg("--out");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: portals } = await supabase.from("locapass_portals").select("id, slug");
  const slugById = new Map((portals ?? []).map((p) => [p.id, p.slug as string]));

  const { data: shops, error } = await supabase
    .from("locapass_shops")
    .select("id, portal_id, name, address")
    .eq("status", "active")
    .is("lat", null)
    .not("address", "is", null)
    .order("portal_id");
  if (error) throw error;

  const targets = (shops ?? []).filter(
    (s) => (s.address ?? "").trim() !== "" && (!onlyPortal || slugById.get(s.portal_id) === onlyPortal),
  );
  console.log(`対象 ${targets.length} 店舗${dryRun ? " (dry-run)" : ""}`);

  const results: Record<string, unknown>[] = [];
  let ok = 0;
  for (const [i, shop] of targets.entries()) {
    const address = (shop.address ?? "").trim();
    const hit = await geocodeAddress(address);
    if (!hit) {
      console.log(`[${i + 1}/${targets.length}] ✗ ${shop.name} … 解決できず (${address})`);
      results.push({ id: shop.id, name: shop.name, address, status: "failed" });
    } else {
      if (!dryRun) {
        const { data, error: upErr } = await supabase
          .from("locapass_shops")
          .update({ lat: hit.lat, lng: hit.lng })
          .eq("id", shop.id)
          .select("id");
        if (upErr || !data?.length) {
          console.log(`[${i + 1}/${targets.length}] ✗ ${shop.name} … 更新失敗 ${upErr?.message ?? "0件"}`);
          results.push({ id: shop.id, name: shop.name, address, status: "update_failed" });
          await sleep(REQUEST_INTERVAL_MS);
          continue;
        }
      }
      ok++;
      console.log(`[${i + 1}/${targets.length}] ✓ ${shop.name} → ${hit.lat}, ${hit.lng} (${hit.matched ?? ""})`);
      results.push({ id: shop.id, name: shop.name, address, status: "ok", lat: hit.lat, lng: hit.lng, matched: hit.matched });
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  console.log(`完了: ${ok} / ${targets.length}`);
  if (outPath) writeFileSync(outPath, JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
