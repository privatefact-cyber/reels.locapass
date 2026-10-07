/**
 * イメージ写真の中身を、AI(Gemini Flash-Lite)で1枚ずつ分類して lib/placeholders/labels.json に保存する。
 * 店舗のジャンルに合う写真だけを割り当てるため(コーヒー屋に蕎麦、バーにとんかつ、を避ける)。
 *
 * 使い方:
 *   npx tsx scripts/classify-placeholders.ts            # 未分類の写真だけ分類(続きから)
 *   npx tsx scripts/classify-placeholders.ts --redo     # 全部やり直す
 *
 * 必要な環境変数(.env.local): GEMINI_API_KEY
 * 対象: manifest.json の food / other グループの写真(他のグループはジャンル=素材の種類なので分類不要)。
 * 費用: 1枚あたり約0.05円。350枚でも20円ほど。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import sharp from "sharp";
import manifest from "../lib/placeholders/manifest.json";
import { geminiLiteGenerateContentUrl } from "../lib/gemini";
import { PHOTO_LABELS } from "../lib/placeholders/shopType";

config({ path: join(process.cwd(), ".env.local"), quiet: true });
const redo = process.argv.includes("--redo");
const LABELS_PATH = join(process.cwd(), "lib/placeholders/labels.json");

const PROMPT = `You classify one photo for use as a stock image on a Japanese shop's page. Choose exactly ONE label for what the photo mainly shows:
- cafe: coffee, tea, latte art, cafe interior, cakes, desserts, sweets, donuts, ice cream, pancakes, waffles, bread/bakery
- bar: alcoholic drinks (cocktails, beer, wine, whisky, sake), bar counter, bottle shelves
- noodle: ramen, udon, soba, noodles in a bowl or soup
- japanese_meal: tonkatsu, tempura, fried chicken, bento, rice bowls, set meals, gyoza, okonomiyaki, takoyaki, yakitori, grilled fish, Japanese dishes
- sushi: sushi, sashimi, seafood dishes, shellfish
- grill: yakiniku, steak, barbecue meat, hot pot, grilled meat
- western: pizza, pasta, burger, sandwich, salad, curry, stew, other western dishes
- interior: the inside of a restaurant, izakaya or eatery (not focused on one dish)
- city: street, city, building, station, landscape, scenery (no food focus)
- unusable: anything else, raw ingredients/spices, people as the main subject, animals, abstract, or unclear
Return ONLY JSON: {"label":"<one of the labels>"}`;

async function classify(file: string): Promise<string> {
  const buf = await sharp(readFileSync(file)).resize({ width: 512, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  const res = await fetch(geminiLiteGenerateContentUrl(process.env.GEMINI_API_KEY!), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 32, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const label = (JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}") as { label?: string }).label ?? "";
  return (PHOTO_LABELS as readonly string[]).includes(label) ? label : "unusable";
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error(".env.local に GEMINI_API_KEY が必要です");
  const labels: Record<string, string> = !redo && existsSync(LABELS_PATH) ? JSON.parse(readFileSync(LABELS_PATH, "utf-8")) : {};
  const targets = (["food", "other"] as const).flatMap((g) => (manifest as Record<string, { photos: { url: string }[] }>)[g].photos.map((p) => p.url));
  const todo = targets.filter((u) => !labels[u]);
  console.log(`分類 ${todo.length} 枚(済み ${targets.length - todo.length} 枚)`);

  let done = 0;
  const queue = [...todo];
  async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        labels[url] = await classify(join(process.cwd(), "public", url));
      } catch (cause) {
        console.error("failed", url, cause);
      }
      if (++done % 25 === 0) {
        writeFileSync(LABELS_PATH, JSON.stringify(labels, null, 1) + "\n");
        console.log(`  ${done}/${todo.length}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync(LABELS_PATH, JSON.stringify(labels, null, 1) + "\n");

  const counts: Record<string, number> = {};
  for (const l of Object.values(labels)) counts[l] = (counts[l] ?? 0) + 1;
  console.log("\n内訳:", counts);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
