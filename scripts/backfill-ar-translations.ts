/**
 * 翻訳対象に追加したアラビア語(ar)を、既存の店舗・料金項目・イベントに作り足すためのSQLを書き出す。
 * 既存の英語・中国語の翻訳には触らず、`translations = translations || {"ar": ...}` でarだけ足す。
 * 日本語が変わっていて翻訳自体が古い行は対象外(次に保存されたときに全言語が作り直される)。
 *
 * --full を付けると、翻訳が無い・日本語と食い違って古い行も対象にして、全言語(en/zh/ar)を作り直す。
 *
 * 使い方:
 *   npx tsx scripts/backfill-ar-translations.ts --out /tmp/ar-backfill.sql [--full]
 *   npx supabase db query --linked -f /tmp/ar-backfill.sql
 *
 * 公開中の店舗を読むだけなので anon キーで動く。翻訳には GEMINI_API_KEY を使う。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import {
  asStoredTranslations,
  needsTranslation,
  translateFieldsBatch,
  translationSourceHash,
  type SourceFields,
} from "../lib/i18n/contentTranslation";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const BATCH_SIZE = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  return { out: i >= 0 ? args[i + 1] : undefined, full: args.includes("--full") };
}

/** SQLの文字列リテラルにする(シングルクォートを二重化)。 */
function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

async function buildStatements<T extends { id: string }>(
  full: boolean,
  label: string,
  table: string,
  column: string,
  rows: T[],
  toFields: (row: T) => SourceFields,
  getStored: (row: T) => unknown,
): Promise<string[]> {
  const targets = rows.filter((row) => {
    const st = asStoredTranslations(getStored(row));
    const fields = toFields(row);
    const hasText = Object.values(fields).some((v) => v && v.trim());
    if (!hasText) return false;
    // 通常: 翻訳が今の日本語と一致していて(hashが同じ)、arだけ無い行。
    // --full: 翻訳が無い・古い・言語が足りない行すべて(全言語を作り直す)。
    return full ? needsTranslation(fields, st) : !st.ar && st.source_hash === translationSourceHash(fields);
  });
  console.log(`${label}: 対象 ${targets.length}件`);

  const statements: string[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const translated = await translateFieldsBatch(batch.map(toFields), full ? undefined : ["ar"]);
    batch.forEach((row, j) => {
      const result = translated[j];
      if (!result || (!full && !result.ar) || (full && !(result.en && result.zh && result.ar))) {
        console.log(`  ✗ ${row.id} (翻訳失敗)`);
        return;
      }
      const oldHash = asStoredTranslations(getStored(row)).source_hash;
      // 翻訳した時点の日本語(hash)から変わっていない行だけ書き込み、間に編集された行を上書きしない。
      const guard = oldHash
        ? `${column}->>'source_hash' = ${sqlString(oldHash)}`
        : `(${column}->>'source_hash') is null`;
      statements.push(
        full
          ? `update public.${table} set ${column} = ${sqlString(JSON.stringify(result))}::jsonb where id = ${sqlString(row.id)} and ${guard};`
          : `update public.${table} set ${column} = ${column} || ${sqlString(JSON.stringify({ ar: result.ar }))}::jsonb ` +
              `where id = ${sqlString(row.id)} and ${guard} and not (${column} ? 'ar');`,
      );
    });
    console.log(`${label}: ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}`);
  }
  return statements;
}

async function main() {
  const { out, full } = parseArgs();
  if (!out) {
    console.error("--out に出力先のSQLパスを指定してください");
    process.exit(1);
  }
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [{ data: shops }, { data: priceItems }, { data: events }] = await Promise.all([
    supabase
      .from("locapass_shops")
      .select("id, description, tagline, business_hours, price_info, usage_notes, translations")
      .eq("status", "active"),
    supabase.from("locapass_shop_price_items").select("id, name, name_translations"),
    supabase.from("locapass_shop_events").select("id, title, body, translations"),
  ]);

  const statements = [
    ...(await buildStatements(
      full,
      "shops",
      "locapass_shops",
      "translations",
      shops ?? [],
      (s) => ({
        description: s.description,
        tagline: s.tagline,
        business_hours: s.business_hours,
        price_info: s.price_info,
        usage_notes: s.usage_notes,
      }),
      (s) => s.translations,
    )),
    ...(await buildStatements(
      full,
      "price_items",
      "locapass_shop_price_items",
      "name_translations",
      priceItems ?? [],
      (p) => ({ name: p.name }),
      (p) => p.name_translations,
    )),
    ...(await buildStatements(
      full,
      "events",
      "locapass_shop_events",
      "translations",
      events ?? [],
      (e) => ({ title: e.title, body: e.body }),
      (e) => e.translations,
    )),
  ];

  writeFileSync(out, statements.join("\n") + "\n");
  console.log(`書き出しました: ${statements.length}文 → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
