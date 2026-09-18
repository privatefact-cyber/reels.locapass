/**
 * 店舗の公式サイトURLから、電話番号・料金表・紹介文・営業時間の候補を読み取り、
 * JSONファイルに書き出す(DBには一切書き込まない)。
 *
 * 使い方:
 *   npx tsx scripts/extract-shop-info.ts --out /path/to/out.json
 *   npx tsx scripts/extract-shop-info.ts --out /path/to/out.json --limit 10
 *   npx tsx scripts/extract-shop-info.ts --out /path/to/out.json --only "AILAND,VEGA"
 *
 * 既にDBに入っている項目は上書きしない前提で、足りない項目だけを対象にする
 * (電話番号が空、料金表が0件、紹介文が空、のいずれかがあれば対象)。
 * 実際の反映は別途SQLで行う(このスクリプトは読み取り専用)。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { previewShopImport, ImportError } from "../lib/shop/importFromWebsite";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const REQUEST_INTERVAL_MS = 1500;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = get("--limit");
  const only = get("--only");
  return {
    out: get("--out") ?? join(process.cwd(), "shop-import-results.json"),
    limit: limit ? Number(limit) : undefined,
    only: only ? only.split(",").map((s) => s.trim()) : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ShopRow = {
  id: string;
  name: string;
  website_url: string | null;
  phone: string | null;
  business_hours: string | null;
  description: string | null;
};

async function main() {
  const { out, limit, only } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が必要です");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, anonKey);

  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, name, website_url, phone, business_hours, description")
    .eq("status", "active")
    .not("website_url", "is", null)
    .order("name")
    .returns<ShopRow[]>();

  if (error) {
    console.error("店舗の取得に失敗しました:", error.message);
    process.exit(1);
  }

  // 料金項目数はshop_price_itemsから別途集計する。
  const { data: priceCounts } = await supabase.from("shop_price_items").select("shop_id");
  const priceCountByShop = new Map<string, number>();
  for (const row of priceCounts ?? []) {
    priceCountByShop.set(row.shop_id, (priceCountByShop.get(row.shop_id) ?? 0) + 1);
  }

  let targets = (shops ?? []).filter((s) => !/サンプル|監視用/.test(s.name));
  if (only) targets = targets.filter((s) => only.includes(s.name));
  targets = targets.filter((s) => {
    const hasPrice = (priceCountByShop.get(s.id) ?? 0) > 0;
    return !s.phone || !hasPrice || !s.description;
  });
  if (limit) targets = targets.slice(0, limit);

  console.log(`対象: ${targets.length}件`);

  const results: Array<{
    id: string;
    name: string;
    website_url: string;
    existing: { phone: string | null; business_hours: string | null; description: boolean };
    extracted?: Awaited<ReturnType<typeof previewShopImport>>;
    error?: string;
  }> = [];

  for (const [i, shop] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${shop.name}`;
    try {
      const preview = await previewShopImport(shop.website_url!);
      results.push({
        id: shop.id,
        name: shop.name,
        website_url: shop.website_url!,
        existing: { phone: shop.phone, business_hours: shop.business_hours, description: !!shop.description },
        extracted: preview,
      });
      console.log(
        `${label} ✓ 電話:${preview.phone ?? "-"} / 料金${preview.price_items.length}件 / 紹介文:${preview.description ? "有" : "-"}`,
      );
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : e instanceof Error ? e.message : String(e);
      results.push({
        id: shop.id,
        name: shop.name,
        website_url: shop.website_url!,
        existing: { phone: shop.phone, business_hours: shop.business_hours, description: !!shop.description },
        error: msg,
      });
      console.log(`${label} ✗ ${msg}`);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }

  writeFileSync(out, JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.extracted).length;
  console.log(`\n完了: 成功 ${ok}件 / 失敗 ${results.length - ok}件 → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
