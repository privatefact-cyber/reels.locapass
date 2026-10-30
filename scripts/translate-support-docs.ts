/**
 * サポートの機能カード(lib/support/docs.ts、日本語が原本)を翻訳して lib/support/docs.i18n.json に書き出す。
 * 日本語が変わっていないカードの、すでにある言語はスキップするので、何度実行しても安全。
 *   お客様向け(user) … 公開サイトの4言語のうち日本語以外(英・中・アラビア語)
 *   店舗向け(shop)   … 管理画面で選べる全言語(lib/i18n/languages.ts)。外国人オーナーが母国語で読めるように
 *
 *   node --import tsx scripts/translate-support-docs.ts          # 古い/未翻訳のカード・言語だけ翻訳
 *   node --import tsx scripts/translate-support-docs.ts --check  # 足りない翻訳があれば終了コード1(確認用)
 *
 * 機能カードを追加・変更したら、このスクリプトも実行してJSONをコミットすること。
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { geminiGenerateWithFallback } from "../lib/gemini";
import { translationSourceHash } from "../lib/i18n/contentTranslation";
import { UI_TRANSLATION_LANGS } from "../lib/i18n/languages";
import { SUPPORT_DOCS } from "../lib/support/docs";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const FILE = join(process.cwd(), "lib/support/docs.i18n.json");
const BATCH_SIZE = 3;
const CONCURRENCY = 3;
const USER_LANGS = ["en", "zh", "ar"];

type Entry = { source_hash?: string; source_lang?: string } & Record<string, unknown>;
type Doc = (typeof SUPPORT_DOCS)[number];

const langsFor = (doc: Doc) => (doc.audience === "shop" ? UI_TRANSLATION_LANGS : UI_TRANSLATION_LANGS.filter((l) => USER_LANGS.includes(l.code)));
const hashOf = (doc: Doc) => translationSourceHash({ title: doc.title, body: doc.body });

async function translateDocs(docs: Doc[], lang: { code: string; english: string }): Promise<({ title: string; body: string } | null)[]> {
  const prompt = [
    "You translate the help articles of a local portal site called LOCAPASS (Japan) for shop owners and visitors who cannot read Japanese.",
    `Translate the title and body of every item from Japanese into ${lang.english}.`,
    "Rules:",
    "- Keep line breaks, bullet marks, numbers, prices, times and Latin product names (LOCAPASS, Boost, FACES, LINE, YouTube, Google, etc.) exactly.",
    "- Button and menu names quoted in 「」or ' ' stay quoted; translate them naturally as the label a user of that language would see.",
    "- Do not add or drop information. Natural, plain, polite wording. Use Western digits 0-9.",
    'Return ONLY a JSON array with one object per input item, in the same order, each shaped as {"title": "...", "body": "..."}.',
    "",
    JSON.stringify(docs.map((d) => ({ title: d.title, body: d.body }))),
  ].join("\n");
  const res = await geminiGenerateWithFallback(
    process.env.GEMINI_API_KEY!,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } },
    "support docs translation",
    90_000,
  );
  if (!res) return docs.map(() => null);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parsed = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
  if (!Array.isArray(parsed) || parsed.length !== docs.length) return docs.map(() => null);
  return parsed.map((p) => (p && typeof p.title === "string" && typeof p.body === "string" && p.title.trim() && p.body.trim() ? { title: p.title.trim(), body: p.body.trim() } : null));
}

async function main() {
  const check = process.argv.includes("--check");
  const current: Record<string, Entry> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};

  // ハッシュが違う(日本語が変わった)カードは、全言語を訳し直す。
  for (const doc of SUPPORT_DOCS) if (current[doc.id] && current[doc.id].source_hash !== hashOf(doc)) delete current[doc.id];

  const work = UI_TRANSLATION_LANGS.map((lang) => ({
    lang,
    docs: SUPPORT_DOCS.filter((d) => langsFor(d).some((l) => l.code === lang.code) && !current[d.id]?.[lang.code]),
  })).filter((w) => w.docs.length > 0);
  const total = work.reduce((n, w) => n + w.docs.length, 0);
  console.log(`翻訳が必要なカード×言語: ${total}件`);
  if (check) process.exit(total ? 1 : 0);
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");

  const save = () => writeFileSync(FILE, JSON.stringify(current, null, 2) + "\n");
  const queue = [...work];
  const worker = async () => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      for (let i = 0; i < w.docs.length; i += BATCH_SIZE) {
        const batch = w.docs.slice(i, i + BATCH_SIZE);
        let results: Awaited<ReturnType<typeof translateDocs>>;
        try {
          results = await translateDocs(batch, w.lang);
        } catch (e) {
          console.warn(`${w.lang.code} 失敗:`, e instanceof Error ? e.message : e);
          continue;
        }
        batch.forEach((doc, n) => {
          const r = results[n];
          if (!r) return console.warn(`失敗: ${doc.id} (${w.lang.code})`);
          current[doc.id] = { ...(current[doc.id] ?? {}), source_hash: hashOf(doc), source_lang: "ja", [w.lang.code]: r };
        });
        save();
      }
      console.log(`${w.lang.code}: ${w.docs.length}件`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 削除されたカードの翻訳は消す。
  const ids = new Set(SUPPORT_DOCS.map((d) => d.id));
  for (const id of Object.keys(current)) if (!ids.has(id)) delete current[id];
  save();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
