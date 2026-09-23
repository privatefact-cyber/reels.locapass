/**
 * 翻訳対象に追加したアラビア語(ar)を、既存の店舗・料金項目・イベントに作り足すためのSQLを書き出す。
 * 既存の英語・中国語の翻訳には触らず、`translations = translations || {"ar": ...}` でarだけ足す。
 * 日本語が変わっていて翻訳自体が古い行は対象外(次に保存されたときに全言語が作り直される)。
 *
 * 使い方:
 *   npx tsx scripts/backfill-ar-translations.ts --out /tmp/ar-backfill.sql
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
  return { out: i >= 0 ? args[i + 1] : undefined };
}

/** SQLの文字列リテラルにする(シングルクォートを二重化)。 */
function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

async function buildStatements<T extends { id: string }>(
  label: string,
  table: string,
  column: string,
  rows: T[],
  toFields: (row: T) => SourceFields,
  getStored: (row: T) => unknown,
): Promise<string[]> {
  // 翻訳が今の日本語と一致していて(hashが同じ)、arだけ無い行が対象。
  const targets = rows.filter((row) => {
    const st = asStoredTranslations(getStored(row));
    const fields = toFields(row);
    const hasText = Object.values(fields).some((v) => v && v.trim());
    return hasText && !st.ar && st.source_hash === translationSourceHash(fields);
  });
  console.log(`${label}: 対象 ${targets.length}件`);

  const statements: string[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const translated = await translateFieldsBatch(batch.map(toFields), ["ar"]);
    batch.forEach((row, j) => {
      const ar = translated[j]?.ar;
      if (!ar) {
        console.log(`  ✗ ${row.id} (翻訳失敗)`);
        return;
      }
      // 翻訳した時点の日本語(hash)が変わっていないことも条件にして、書き込みの間に編集された行を上書きしない。
      statements.push(
        `update public.${table} set ${column} = ${column} || ${sqlString(JSON.stringify({ ar }))}::jsonb ` +
          `where id = ${sqlString(row.id)} and ${column}->>'source_hash' = ${sqlString(translationSourceHash(toFields(row)))} and not (${column} ? 'ar');`,
      );
    });
    console.log(`${label}: ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}`);
  }
  return statements;
}

async function main() {
  const { out } = parseArgs();
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
      "price_items",
      "locapass_shop_price_items",
      "name_translations",
      priceItems ?? [],
      (p) => ({ name: p.name }),
      (p) => p.name_translations,
    )),
    ...(await buildStatements(
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
