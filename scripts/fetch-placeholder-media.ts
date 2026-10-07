/**
 * 写真/動画が無い店舗の見た目を整えるための、無料の「イメージ写真・動画」をPixabayから集める。
 * ファイルは public/placeholders/{group}/ に保存し(Pixabayは外部からの直接参照を禁止しているため、自前で配信する)、
 * 一覧とクレジットを lib/placeholders/manifest.json に書き出す。
 *
 * 使い方(PixabayのAPIキーは https://pixabay.com/api/docs/ にログインすると無料で表示される):
 *   .env.local に  PIXABAY_API_KEY=xxxxxxxx  を追加してから
 *   npx tsx scripts/fetch-placeholder-media.ts --dry-run   # 取得内容を表示だけ(保存・manifest更新なし)
 *   npx tsx scripts/fetch-placeholder-media.ts             # ダウンロードして manifest.json を更新
 *   npx tsx scripts/fetch-placeholder-media.ts --photos 5 --videos 1   # 1グループあたりの本数(既定: 写真5・動画1)
 *
 * 費用: 無料(1分100回まで。このスクリプトは50回ほどしか呼ばず、間隔を空けて呼ぶ)。
 * 規約: Pixabayの素材は商用利用できる(クレジットは必須ではないが、出所を表示するよう求められる)。
 *       manifestに投稿者名とPixabayのページURLを保存し、画面にも「イメージ ・ 投稿者名 / Pixabay」と出している。
 * 容量: 写真は1枚200〜400KB、動画(tiny)は1本1〜3MB程度。既定で全体 10〜20MB ほど。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import current from "../lib/placeholders/manifest.json";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const PHOTOS = arg("--photos", 5);
const VIDEOS = arg("--videos", 1);
const MAX_VIDEO_SECONDS = 20;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;

/** グループごとの検索語(英語のほうが当たりが良い)。 */
const QUERIES: Record<string, string[]> = {
  food: ["japanese cafe", "restaurant interior", "japanese food"],
  shop: ["boutique shop", "shopping street"],
  tour: ["japan scenery", "japan temple"],
  stay: ["hotel room", "japanese ryokan"],
  pet: ["dog park", "cute dog"],
  beauty: ["hair salon", "spa beauty"],
  other: ["japan city street", "modern interior"],
};

type Entry = { url: string; poster?: string | null; credit: string; creditUrl: string; source: string };
type Hit = { id: number; pageURL: string; user: string; largeImageURL: string };
type VideoFile = { url: string; width: number; height: number; size: number; thumbnail: string };
type VideoHit = { id: number; pageURL: string; user: string; duration: number; videos: Record<string, VideoFile | undefined> };

const KEY = process.env.PIXABAY_API_KEY;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://pixabay.com/api/${path}&key=${KEY}&safesearch=true`);
  if (!res.ok) throw new Error(`Pixabay ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function download(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}: ${url}`);
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (!KEY) throw new Error(".env.local に PIXABAY_API_KEY が必要です(https://pixabay.com/api/docs/ にログインすると表示されます)");

  const next: Record<string, { photos: Entry[]; videos: Entry[] }> = {};
  for (const [group, queries] of Object.entries(QUERIES)) {
    const dir = join(process.cwd(), "public/placeholders", group);
    if (!dryRun) mkdirSync(dir, { recursive: true });
    const photos: Entry[] = [];
    const videos: Entry[] = [];
    const perQueryPhotos = Math.ceil(PHOTOS / queries.length);

    for (const q of queries) {
      const enc = encodeURIComponent(q);
      const p = await api<{ hits: Hit[] }>(`?q=${enc}&image_type=photo&orientation=horizontal&per_page=${Math.max(3, perQueryPhotos)}`);
      for (const hit of p.hits.slice(0, perQueryPhotos)) {
        if (photos.length >= PHOTOS) break;
        const file = `photo-${photos.length + 1}.jpg`;
        if (!dryRun) await download(hit.largeImageURL, join(dir, file));
        photos.push({ url: `/placeholders/${group}/${file}`, credit: hit.user, creditUrl: hit.pageURL, source: "Pixabay" });
        await sleep(300);
      }
      await sleep(700);
    }

    // 動画: 短く(20秒以内)・軽い(tiny)ものだけ。最初の検索語から順に探して必要本数に達したら終わる。
    for (const q of queries) {
      if (videos.length >= VIDEOS) break;
      const enc = encodeURIComponent(q);
      const v = await api<{ hits: VideoHit[] }>(`videos/?q=${enc}&per_page=20`);
      for (const hit of v.hits) {
        if (videos.length >= VIDEOS) break;
        const f = hit.videos.tiny ?? hit.videos.small;
        if (!f || hit.duration > MAX_VIDEO_SECONDS || f.size > MAX_VIDEO_BYTES) continue;
        const n = videos.length + 1;
        if (!dryRun) {
          await download(f.url, join(dir, `video-${n}.mp4`));
          await download(f.thumbnail, join(dir, `video-${n}.jpg`));
        }
        videos.push({
          url: `/placeholders/${group}/video-${n}.mp4`,
          poster: `/placeholders/${group}/video-${n}.jpg`,
          credit: hit.user,
          creditUrl: hit.pageURL,
          source: "Pixabay",
        });
        await sleep(300);
      }
      await sleep(700);
    }

    next[group] = { photos, videos };
    console.log(`${group}: 写真${photos.length}枚 / 動画${videos.length}本`);
  }

  if (dryRun) {
    console.log("\n(dry-run: ダウンロードも manifest.json の更新もしていません)");
    return;
  }
  const path = join(process.cwd(), "lib/placeholders/manifest.json");
  writeFileSync(path, JSON.stringify({ ...current, ...next }, null, 2) + "\n");
  console.log(`\n${path} を更新しました。public/placeholders/ とあわせてコミットして反映してください。`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
