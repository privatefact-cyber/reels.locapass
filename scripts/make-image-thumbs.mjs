// public/placeholders の写真(jpg)から、一覧のタイル用の軽い縮小版(webp)を作る。
// 出力: public/placeholders-thumb/<group>/<name>.webp  (元の public/placeholders は変更しない)
// 実行: node scripts/make-image-thumbs.mjs
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = "public/placeholders";
const DST = "public/placeholders-thumb";
const WIDTH = 480; // 3列タイル(スマホで約130css px × 3倍密度)に足りる幅
const QUALITY = 72;

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let count = 0;
let before = 0;
let after = 0;
for await (const file of walk(SRC)) {
  if (!/\.jpe?g$/i.test(file)) continue;
  const rel = path.relative(SRC, file).replace(/\.jpe?g$/i, ".webp");
  const out = path.join(DST, rel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const info = await sharp(file).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(out);
  before += (await fs.stat(file)).size;
  after += info.size;
  count++;
}
console.log(`${count}枚: ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`);
