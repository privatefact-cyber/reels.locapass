/**
 * 管理画面(店舗オーナー向け)の日本語の文言を、ソースから拾って英語・中国語・アラビア語に翻訳し、
 * lib/dashboard-i18n/catalog.json に書き出す。日本語が原本で、画面側は components/locapass-dashboard/DashboardTranslator.tsx が
 * 表示された文言をこのカタログで差し替える(日本語のままの文言は、そのまま日本語で出る)。
 *
 *   node --import tsx scripts/translate-dashboard-ui.ts          # 新しい・未翻訳の文言だけ翻訳して追記
 *   node --import tsx scripts/translate-dashboard-ui.ts --check  # 未翻訳があれば一覧して終了コード1
 *
 * 管理画面の文言を足したり変えたりしたら、これを実行してカタログをコミットすること。
 * 拾うもの: 文字列リテラル・JSXの文字・テンプレート文字列(${…}は {0} {1} の穴にする)。
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { geminiGenerateWithFallback } from "../lib/gemini";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const ROOTS = ["app/dashboard", "components/locapass-dashboard", "lib/locapass-dashboard", "components/reels/ReelCaptionEditor.tsx", "components/support"];
const CATALOG = join(process.cwd(), "lib/dashboard-i18n/catalog.json");
const LANGS = ["en", "zh", "ar"] as const;
const BATCH = 40;
const CJK = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

type Catalog = Record<string, Partial<Record<(typeof LANGS)[number], string>>>;

function listFiles(path: string): string[] {
  const full = join(process.cwd(), path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [path];
  return readdirSync(full).flatMap((name) => listFiles(join(path, name)));
}

/** JSXの文字は、改行をまたぐ行を trim して空白1つでつないだものが画面に出る(Reactと同じ規則)。 */
function jsxTextValue(raw: string): string {
  const lines = raw.split(/\r?\n/);
  return lines
    .map((line, i) => {
      let l = line;
      if (i > 0) l = l.replace(/^\s+/, "");
      if (i < lines.length - 1) l = l.replace(/\s+$/, "");
      return l;
    })
    .filter((l) => l.length > 0)
    .join(" ")
    .trim();
}

function extract(file: string): string[] {
  const src = readFileSync(join(process.cwd(), file), "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.replace(/\s+/g, " ").trim();
    if (v && CJK.test(v)) out.push(v);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) add(jsxTextValue(node.text));
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // import 文・console.* の引数・プロパティ名は画面に出ない。
      const parent = node.parent;
      const isPropName = ts.isPropertyAssignment(parent) && parent.name === node;
      const isConsole =
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        ts.isIdentifier(parent.expression.expression) &&
        parent.expression.expression.text === "console";
      if (!isPropName && !isConsole) add(node.text);
    } else if (ts.isTemplateExpression(node)) {
      let i = 0;
      let pattern = node.head.text;
      for (const span of node.templateSpans) pattern += `{${i++}}${span.literal.text}`;
      add(pattern);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function collectStrings(): string[] {
  const files = ROOTS.flatMap(listFiles).filter((f) => /\.(ts|tsx)$/.test(f));
  const all = new Set<string>();
  for (const f of files) for (const s of extract(f)) all.add(s);
  return [...all].sort();
}

const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");

const LANG_LABEL = { en: "natural English", zh: "Simplified Chinese", ar: "Modern Standard Arabic" } as const;

async function translateBatch(strings: string[]): Promise<Catalog> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  const prompt = [
    "You translate the user-interface text of an admin dashboard used by shop owners (restaurants, cafes, bars, car dealers, etc.) of a local portal site called LOCAPASS in Japan.",
    "The owners may be foreigners living in Japan who cannot read Japanese, so the translation must be clear and natural for a native speaker.",
    `Translate every Japanese string into: ${LANGS.map((l) => `${LANG_LABEL[l]} (key "${l}")`).join(", ")}.`,
    "Rules:",
    "- Keep placeholders such as {0} {1} exactly as they are (same count, may be reordered for natural grammar).",
    "- Keep emoji, symbols, numbers, and Latin product names (LOCAPASS, Boost, FACES, LINE, YouTube, Google, Instagram, etc.) as they are.",
    "- Buttons and labels: short and imperative/noun style. Messages: polite and plain.",
    "- Do not add or drop information. Keep line breaks (\\n) and punctuation style appropriate for the target language.",
    "- In Arabic use Western digits 0-9.",
    "Return ONLY JSON: an array with one object per input string, in the same order, each shaped as {\"en\": \"...\", \"zh\": \"...\", \"ar\": \"...\"}.",
    "",
    JSON.stringify(strings),
  ].join("\n");
  const res = await geminiGenerateWithFallback(
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } },
    "dashboard ui translation",
    60_000,
  );
  if (!res) throw new Error("translation failed on all models");
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parsed = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
  const out: Catalog = {};
  if (!Array.isArray(parsed) || parsed.length !== strings.length) return out;
  strings.forEach((s, i) => {
    const row = parsed[i] as Record<string, unknown>;
    const entry: Catalog[string] = {};
    for (const lang of LANGS) {
      const v = row?.[lang];
      // 穴({0}…)の数が合わない訳は使わない(画面で値が欠ける)。
      if (typeof v === "string" && v.trim() && holes(v) === holes(s)) entry[lang] = v.trim();
    }
    if (LANGS.every((l) => entry[l])) out[s] = entry;
  });
  return out;
}

async function main() {
  const check = process.argv.includes("--check");
  const catalog: Catalog = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : {};
  const strings = collectStrings();
  const missing = strings.filter((s) => !LANGS.every((l) => catalog[s]?.[l]));
  console.log(`文言: ${strings.length}件 / 未翻訳: ${missing.length}件`);
  if (check) {
    missing.slice(0, 50).forEach((s) => console.log(`  ${s}`));
    process.exit(missing.length ? 1 : 0);
  }

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      Object.assign(catalog, await translateBatch(batch));
    } catch (e) {
      console.warn(`バッチ失敗 (${i}-${i + BATCH}):`, e instanceof Error ? e.message : e);
    }
    // 途中で止まっても進んだ分は残す。
    const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(CATALOG, JSON.stringify(sorted, null, 1) + "\n");
    console.log(`${Math.min(i + BATCH, missing.length)}/${missing.length}`);
  }
  const left = strings.filter((s) => !LANGS.every((l) => catalog[s]?.[l]));
  if (left.length) console.warn(`未翻訳のまま: ${left.length}件(もう一度実行すると再試行します)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
