/**
 * 管理画面(店舗オーナー向け)の日本語の文言を、ソースから拾って各言語(英・中・繁体字中国語・ネパール語・ベトナム語・インドネシア語・ミャンマー語・タイ語・ポルトガル語・トルコ語・ロシア語・スペイン語・アラビア語)に翻訳し、
 * lib/dashboard-i18n/catalog.json に書き出す(言語は lib/i18n/languages.ts)。日本語が原本で、画面側は components/locapass-dashboard/DashboardTranslator.tsx が
 * 表示された文言をこのカタログで差し替える(日本語のままの文言は、そのまま日本語で出る)。
 *
 *   node --import tsx scripts/translate-dashboard-ui.ts          # 新しい・未翻訳の文言だけ翻訳して追記
 *   node --import tsx scripts/translate-dashboard-ui.ts --check  # 未翻訳があれば一覧して終了コード1
 *   node --import tsx scripts/translate-dashboard-ui.ts --lang=ne,vi  # その言語だけ作る
 *
 * 管理画面の文言を足したり変えたりしたら、これを実行してカタログをコミットすること。
 * 拾うもの: 文字列リテラル・JSXの文字・テンプレート文字列(${…}は {0} {1} の穴にする)。
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { geminiGenerateWithFallback } from "../lib/gemini";
import { UI_TRANSLATION_LANGS } from "../lib/i18n/languages";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const ROOTS = ["app/dashboard", "components/locapass-dashboard", "lib/locapass-dashboard", "components/reels/ReelCaptionEditor.tsx", "components/support"];
const CATALOG = join(process.cwd(), "lib/dashboard-i18n/catalog.json");
const LANGS = UI_TRANSLATION_LANGS;
const BATCH = 50;
/** 同時に翻訳する言語の数(APIの混雑を避ける)。 */
const CONCURRENCY = 3;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uFF66-\uFF9F]/;

type Catalog = Record<string, Record<string, string>>;

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

/** 日本語の文言を、1つの言語へ翻訳する(返りは 日本語 → 訳。穴の数が合わない訳は捨てる)。 */
async function translateBatch(strings: string[], lang: { code: string; english: string }): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  const prompt = [
    "You translate the user-interface text of an admin dashboard used by shop owners (restaurants, cafes, bars, shops, car dealers, etc.) of a local portal site called LOCAPASS in Japan.",
    "The owners are foreigners living in Japan who cannot read Japanese, so the translation must be clear and natural for a native speaker.",
    `Translate every Japanese string into ${lang.english}.`,
    "Rules:",
    "- Keep placeholders such as {0} {1} exactly as they are (same count, may be reordered for natural grammar).",
    "- Keep emoji, symbols, numbers, and Latin product names (LOCAPASS, Boost, FACES, LINE, YouTube, Google, Instagram, etc.) as they are.",
    "- Buttons and labels: short and imperative/noun style. Messages: polite and plain.",
    "- Do not add or drop information. Keep line breaks (\\n) and punctuation style appropriate for the target language.",
    "- Use Western digits 0-9.",
    "Return ONLY a JSON array of strings: one translation per input string, in the same order.",
    "",
    JSON.stringify(strings),
  ].join("\n");
  const res = await geminiGenerateWithFallback(
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } },
    "dashboard ui translation",
    80_000,
  );
  if (!res) throw new Error("translation failed on all models");
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parsed = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
  const out: Record<string, string> = {};
  if (!Array.isArray(parsed) || parsed.length !== strings.length) return out;
  strings.forEach((s, i) => {
    const v = parsed[i];
    if (typeof v === "string" && v.trim() && holes(v) === holes(s)) out[s] = v.trim();
  });
  return out;
}

async function main() {
  const check = process.argv.includes("--check");
  // --lang=ne,vi のように指定すると、その言語だけ作る(指定なしは全言語)。
  const only = process.argv.find((a) => a.startsWith("--lang="))?.slice(7).split(",");
  const langs = only ? LANGS.filter((l) => only.includes(l.code)) : LANGS;
  const catalog: Catalog = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : {};
  const strings = collectStrings();
  const missingFor = (code: string) => strings.filter((s) => !catalog[s]?.[code]);
  const total = langs.reduce((n, l) => n + missingFor(l.code).length, 0);
  console.log(`文言: ${strings.length}件 / 言語: ${langs.length} / 未翻訳: ${total}件`);
  if (check) {
    for (const l of langs) {
      const m = missingFor(l.code);
      if (m.length) console.log(`  ${l.code}: ${m.length}件 (例: ${m[0]})`);
    }
    process.exit(total ? 1 : 0);
  }

  const save = () => {
    const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(CATALOG, JSON.stringify(sorted, null, 1) + "\n");
  };

  const queue = [...langs];
  const worker = async () => {
    for (let lang = queue.shift(); lang; lang = queue.shift()) {
      const missing = missingFor(lang.code);
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        try {
          const translated = await translateBatch(batch, lang);
          for (const [ja, text] of Object.entries(translated)) (catalog[ja] ??= {})[lang.code] = text;
        } catch (e) {
          console.warn(`${lang.code} バッチ失敗 (${i}-${i + BATCH}):`, e instanceof Error ? e.message : e);
        }
        // 途中で止まっても進んだ分は残す。
        save();
        console.log(`${lang.code}: ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const left = langs.reduce((n, l) => n + missingFor(l.code).length, 0);
  if (left) console.warn(`未翻訳のまま: ${left}件(もう一度実行すると再試行します)`);
  else console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
