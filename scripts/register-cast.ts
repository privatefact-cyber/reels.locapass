/**
 * キャストの一括登録スクリプト(CSV入力)。
 *
 * 使い方:
 *   npx tsx scripts/register-cast.ts --input scripts/cast-intake/casts.csv --photos-dir scripts/cast-intake/photos
 *
 * CSVフォーマット(1行目はヘッダー、UTF-8):
 *   shop,name,age,pr_text,photos
 *   ガールズバー池袋,あかり,24,明るい性格です,akari1.jpg|akari2.jpg
 *
 * - shop は public.shops.name と完全一致させること(事前にDBの店舗名を確認する)。
 * - age と pr_text は空欄可。
 * - photos は photos-dir 内のファイル名を "|" 区切りで。1枚目がメイン写真になる。
 *
 * 実際の登録処理は scripts/lib/cast-register-core.ts を参照
 * (管理画面(/dashboard/cast)と同じRLS経路を通す)。Notion連携版は
 * register-cast-from-json.ts。
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerCasts, type CastInput } from "./lib/cast-register-core";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const input = get("--input");
  const photosDir = get("--photos-dir");
  if (!input || !photosDir) {
    console.error(
      "使い方: npx tsx scripts/register-cast.ts --input <casts.csv> --photos-dir <photosフォルダ>",
    );
    process.exit(1);
  }
  return { input, photosDir };
}

function parseCsv(text: string, photosDir: string): CastInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [header, ...rows] = lines;
  const cols = header.split(",").map((c) => c.trim());
  return rows.map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const rec: Record<string, string> = {};
    cols.forEach((c, i) => (rec[c] = cells[i] ?? ""));
    return {
      shop: rec.shop ?? "",
      name: rec.name ?? "",
      age: rec.age ?? "",
      prText: rec.pr_text ?? "",
      photoPaths: (rec.photos ?? "")
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((filename) => join(photosDir, filename)),
    };
  });
}

function writeResultsCsv(results: Awaited<ReturnType<typeof registerCasts>>) {
  const resultsDir = join(process.cwd(), "scripts/cast-intake/results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `result-${Date.now()}.csv`);
  const csvLines = [
    "shop,name,status,cast_id,login_email,initial_password,error",
    ...results.map((r) =>
      [r.shop, r.name, r.status, r.castId ?? "", r.loginEmail ?? "", r.initialPassword ?? "", r.error ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  writeFileSync(outPath, csvLines.join("\n"), "utf-8");
  return outPath;
}

async function main() {
  const { input, photosDir } = parseArgs();
  const rows = parseCsv(readFileSync(input, "utf-8"), photosDir);
  if (rows.length === 0) {
    console.log("登録対象がありません(CSVが空)。");
    return;
  }

  const results = await registerCasts(rows);
  const outPath = writeResultsCsv(results);
  const okCount = results.filter((r) => r.status === "success").length;
  console.log(`\n${okCount}/${results.length} 件成功。結果一覧: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
