/**
 * extract-shop-info.ts の結果JSONから、DB反映用のSQLを組み立てて標準出力に書く。
 * 既にある値は上書きしない(phone/description/business_hoursはnullの場合のみ埋める)。
 * 料金表は、今その店舗に1件も無い場合だけ、抽出した候補をそのまま挿入する。
 *
 * 使い方:
 *   npx tsx scripts/build-shop-import-sql.ts /path/to/shop-import-full.json > /path/to/apply.sql
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

type Result = {
  id: string;
  name: string;
  existing: { phone: string | null; business_hours: string | null; description: boolean };
  extracted?: {
    description: string | null;
    business_hours: string | null;
    phone: string | null;
    price_items: { name: string; duration_minutes: number | null; price: number }[];
  };
  error?: string;
};

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("使い方: build-shop-import-sql.ts <results.json>");
    process.exit(1);
  }
  const results: Result[] = JSON.parse(readFileSync(path, "utf-8"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient<Database>(url, anonKey);

  const { data: priceRows } = await supabase.from("shop_price_items").select("shop_id, name");
  const priceCountByShop = new Map<string, number>();
  for (const row of priceRows ?? []) {
    priceCountByShop.set(row.shop_id, (priceCountByShop.get(row.shop_id) ?? 0) + 1);
  }

  const lines: string[] = [];
  let updateCount = 0;
  let priceInsertCount = 0;
  let priceRowCount = 0;

  for (const r of results) {
    if (!r.extracted) continue;
    const patch: string[] = [];
    if (!r.existing.phone && r.extracted.phone) patch.push(`phone = '${esc(r.extracted.phone)}'`);
    if (!r.existing.description && r.extracted.description) {
      patch.push(`description = '${esc(r.extracted.description)}'`);
    }
    if (!r.existing.business_hours && r.extracted.business_hours) {
      patch.push(`business_hours = '${esc(r.extracted.business_hours)}'`);
    }
    if (patch.length > 0) {
      lines.push(`update public.shops set ${patch.join(", ")} where id = '${r.id}'; -- ${r.name}`);
      updateCount += 1;
    }

    const hasPrice = (priceCountByShop.get(r.id) ?? 0) > 0;
    const items = (r.extracted.price_items ?? []).slice(0, 20);
    if (!hasPrice && items.length > 0) {
      const values = items
        .map((it, i) => {
          const dur = it.duration_minutes != null ? String(it.duration_minutes) : "null";
          return `('${r.id}', '${esc(it.name)}', ${dur}, ${it.price}, ${i})`;
        })
        .join(",\n  ");
      lines.push(
        `insert into public.shop_price_items (shop_id, name, duration_minutes, price, display_order) values\n  ${values}; -- ${r.name}`,
      );
      priceInsertCount += 1;
      priceRowCount += items.length;
    }
  }

  console.log(lines.join("\n\n"));
  console.error(
    `\n-- 生成件数: shops更新 ${updateCount}件 / 料金表挿入 ${priceInsertCount}店舗(${priceRowCount}行)`,
  );
}

main();
