/**
 * Notion連携用: JSONマニフェスト(Claudeがnotion-fetchの結果から生成)を読み込んで
 * scripts/lib/cast-register-core.ts の登録処理を実行し、結果をJSONで出力する。
 * 人間が直接使うツールではなく、docs/notion-cast-intake.md のワークフローの一部。
 *
 * 使い方:
 *   npx tsx scripts/register-cast-from-json.ts --input <manifest.json> --output <results.json>
 *
 * manifest.json の形式:
 *   [{ "shop": "...", "name": "...", "age": "24", "prText": "...", "photoPaths": ["/abs/path.jpg"], "notionPageId": "..." }]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { registerCasts, type CastInput } from "./lib/cast-register-core";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const input = get("--input");
  const output = get("--output");
  if (!input || !output) {
    console.error(
      "使い方: npx tsx scripts/register-cast-from-json.ts --input <manifest.json> --output <results.json>",
    );
    process.exit(1);
  }
  return { input, output };
}

async function main() {
  const { input, output } = parseArgs();
  const manifest: (CastInput & { notionPageId?: string })[] = JSON.parse(readFileSync(input, "utf-8"));
  if (manifest.length === 0) {
    writeFileSync(output, "[]", "utf-8");
    return;
  }

  const results = await registerCasts(manifest);
  // notionPageId を結果に付け戻す(順序が保たれる前提)。
  const withPageId = results.map((r, i) => ({ ...r, notionPageId: manifest[i].notionPageId }));
  writeFileSync(output, JSON.stringify(withPageId, null, 2), "utf-8");
  console.log(`結果を書き出しました: ${output}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
