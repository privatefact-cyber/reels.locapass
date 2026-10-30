/**
 * サポートの機能カード(lib/support/docs.ts、日本語が原本)を英語・中国語・アラビア語に翻訳して
 * lib/support/docs.i18n.json に書き出す。日本語が変わっていないカードはスキップするので、何度実行しても安全。
 *
 *   node --import tsx scripts/translate-support-docs.ts          # 古い/未翻訳のカードだけ翻訳
 *   node --import tsx scripts/translate-support-docs.ts --check  # 翻訳が古いカードがあれば終了コード1(CI・確認用)
 *
 * 機能カードを追加・変更したら、このスクリプトも実行してJSONをコミットすること。
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { translateFieldsBatch, translationSourceHash, type StoredTranslations } from "../lib/i18n/contentTranslation";
import { SUPPORT_DOCS } from "../lib/support/docs";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const FILE = join(process.cwd(), "lib/support/docs.i18n.json");
const BATCH_SIZE = 3;

type Entry = StoredTranslations;

async function main() {
  const check = process.argv.includes("--check");
  const current: Record<string, Entry> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  const fieldsOf = (d: (typeof SUPPORT_DOCS)[number]) => ({ title: d.title, body: d.body });

  const stale = SUPPORT_DOCS.filter((d) => current[d.id]?.source_hash !== translationSourceHash(fieldsOf(d)) || !current[d.id]?.en || !current[d.id]?.zh || !current[d.id]?.ar);
  console.log(`翻訳が必要なカード: ${stale.length} / ${SUPPORT_DOCS.length}`);
  if (check) process.exit(stale.length ? 1 : 0);
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");

  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE);
    const results = await translateFieldsBatch(batch.map(fieldsOf), ["en", "zh", "ar"]);
    batch.forEach((doc, n) => {
      const r = results[n];
      if (r) current[doc.id] = r;
      else console.warn(`失敗: ${doc.id}`);
    });
    // 途中で止まっても進んだ分は残す。
    writeFileSync(FILE, JSON.stringify(current, null, 2) + "\n");
    console.log(`${Math.min(i + BATCH_SIZE, stale.length)}/${stale.length}`);
  }

  // 削除されたカードの翻訳は消す。
  const ids = new Set(SUPPORT_DOCS.map((d) => d.id));
  for (const id of Object.keys(current)) if (!ids.has(id)) delete current[id];
  writeFileSync(FILE, JSON.stringify(current, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
