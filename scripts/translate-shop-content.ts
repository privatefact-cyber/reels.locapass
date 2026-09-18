/**
 * 既存店舗の文章(紹介文・キャッチコピー・営業時間・料金目安・利用説明)、料金項目名、イベントを
 * まとめて英語・中国語に翻訳し、DBに入れるための値をJSONで書き出すスクリプト。
 *
 * 使い方:
 *   npx tsx scripts/translate-shop-content.ts --out /tmp/translations.json
 *
 * 新しく保存された店舗情報は保存時に自動で翻訳される(app/dashboard/shop/actions.ts)。
 * このスクリプトは、翻訳機能を入れる前から登録されていた店舗のぶんを埋めるためのもの。
 *
 * 公開中の店舗を読むだけなので anon キーで動く(書き込みはしない)。
 * 出力したJSONを運営権限でDBに反映すること。翻訳には GEMINI_API_KEY を使う。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import { needsTranslation, translateFieldsBatch } from "../lib/i18n/contentTranslation";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

/** 1回のAPI呼び出しで送る件数。多すぎると応答が崩れやすい。 */
const BATCH_SIZE = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  return { out: outIndex >= 0 ? args[outIndex + 1] : undefined };
}

async function translateAll<T>(
  label: string,
  rows: T[],
  toFields: (row: T) => Record<string, string | null>,
): Promise<{ row: T; translations: unknown }[]> {
  const results: { row: T; translations: unknown }[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const translated = await translateFieldsBatch(batch.map(toFields));
    batch.forEach((row, j) => {
      if (translated[j]) results.push({ row, translations: translated[j] });
    });
    console.log(`${label}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  return results;
}

async function main() {
  const { out } = parseArgs();
  if (!out) {
    console.error("--out に出力先のJSONパスを指定してください");
    process.exit(1);
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [{ data: shops }, { data: priceItems }, { data: events }] = await Promise.all([
    supabase
      .from("shops")
      .select("id, description, tagline, business_hours, price_info, usage_notes, translations")
      .eq("status", "active"),
    supabase.from("shop_price_items").select("id, name, name_translations"),
    supabase.from("shop_events").select("id, title, body, translations"),
  ]);

  const shopFields = (s: NonNullable<typeof shops>[number]) => ({
    description: s.description,
    tagline: s.tagline,
    business_hours: s.business_hours,
    price_info: s.price_info,
    usage_notes: s.usage_notes,
  });

  const shopTargets = (shops ?? []).filter((s) => needsTranslation(shopFields(s), s.translations));
  const priceTargets = (priceItems ?? []).filter((p) => needsTranslation({ name: p.name }, p.name_translations));
  const eventTargets = (events ?? []).filter((e) => needsTranslation({ title: e.title, body: e.body }, e.translations));

  const result = {
    shops: (await translateAll("shops", shopTargets, shopFields)).map(({ row, translations }) => ({
      id: row.id,
      translations,
    })),
    price_items: (await translateAll("price_items", priceTargets, (p) => ({ name: p.name }))).map(
      ({ row, translations }) => ({ id: row.id, translations }),
    ),
    events: (await translateAll("events", eventTargets, (e) => ({ title: e.title, body: e.body }))).map(
      ({ row, translations }) => ({ id: row.id, translations }),
    ),
  };

  writeFileSync(out, JSON.stringify(result));
  console.log(
    `書き出しました: shops ${result.shops.length}件 / price_items ${result.price_items.length}件 / events ${result.events.length}件 → ${out}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
