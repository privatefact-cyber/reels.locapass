/**
 * 写真/動画が無い店舗の見た目を整えるための、無料の「イメージ写真・動画」をPexelsから集める。
 * 集めた結果は lib/placeholders/manifest.json に書き出す(画像/動画ファイル自体は保存せず、PexelsのCDNを直接参照する)。
 *
 * 使い方(PexelsのAPIキーは https://www.pexels.com/api/ で無料発行):
 *   .env.local に  PEXELS_API_KEY=xxxxxxxx  を追加してから
 *   npx tsx scripts/fetch-placeholder-media.ts --dry-run   # 取得内容を表示だけ(manifestは書き換えない)
 *   npx tsx scripts/fetch-placeholder-media.ts             # manifest.json を更新
 *   npx tsx scripts/fetch-placeholder-media.ts --photos 8 --videos 3   # 1グループあたりの本数(既定: 写真8・動画3)
 *
 * 費用: 無料(PexelsのAPIは1時間200回・月2万回まで)。このスクリプトは全部で20回ほどしか呼ばない。
 * 規約: Pexelsの写真・動画は商用利用できる。APIの利用では、撮影者とPexelsへのクレジット(リンク)を表示する決まりなので、
 *       manifestにクレジットも一緒に保存し、画面にも「イメージ ・ 撮影者名 / Pexels」と出している。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import current from "../lib/placeholders/manifest.json";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const PHOTOS = arg("--photos", 8);
const VIDEOS = arg("--videos", 3);

/** グループごとの検索語(英語のほうが当たりが良い)。 */
const QUERIES: Record<string, string[]> = {
  food: ["japanese cafe interior", "restaurant dining", "izakaya japan food"],
  shop: ["boutique shop interior", "japan shopping street"],
  tour: ["japan travel scenery", "japan temple garden"],
  stay: ["hotel room interior", "ryokan onsen japan"],
  pet: ["dog park", "cute dog cafe"],
  beauty: ["hair salon", "beauty salon spa"],
  other: ["japan city street", "modern building interior"],
};

type Entry = { url: string; poster?: string | null; credit: string; creditUrl: string };
type PexelsPhoto = { url: string; photographer: string; photographer_url: string; src: { large: string } };
type PexelsVideo = {
  url: string;
  image: string;
  duration: number;
  user: { name: string; url: string };
  video_files: { file_type: string; width: number | null; height: number | null; link: string }[];
};

const KEY = process.env.PEXELS_API_KEY;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.pexels.com${path}`, { headers: { Authorization: KEY! } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** 動画ファイルは、横幅が640〜1280pxのmp4のうち最も小さいもの(ヒーローやフィードで十分で、軽い)。 */
function pickVideoFile(v: PexelsVideo): string | null {
  const files = v.video_files
    .filter((f) => f.file_type === "video/mp4" && (f.width ?? 0) >= 640 && (f.width ?? 0) <= 1280)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return files[0]?.link ?? null;
}

async function main() {
  if (!KEY) throw new Error(".env.local に PEXELS_API_KEY が必要です(https://www.pexels.com/api/ で無料発行)");

  const next: Record<string, { photos: Entry[]; videos: Entry[] }> = {};
  for (const [group, queries] of Object.entries(QUERIES)) {
    const photos: Entry[] = [];
    const videos: Entry[] = [];
    const perQueryPhotos = Math.ceil(PHOTOS / queries.length);
    const perQueryVideos = Math.ceil(VIDEOS / queries.length);

    for (const q of queries) {
      const enc = encodeURIComponent(q);
      const p = await api<{ photos: PexelsPhoto[] }>(`/v1/search?query=${enc}&per_page=${perQueryPhotos}&orientation=landscape`);
      for (const ph of p.photos) {
        photos.push({ url: ph.src.large, credit: ph.photographer, creditUrl: ph.url });
      }
      await sleep(400);
      // 短い動画だけ(25秒以内)。長いと重いので。
      const v = await api<{ videos: PexelsVideo[] }>(`/videos/search?query=${enc}&per_page=${perQueryVideos * 3}&orientation=landscape&size=small`);
      let taken = 0;
      for (const vd of v.videos) {
        if (taken >= perQueryVideos) break;
        const link = vd.duration <= 25 ? pickVideoFile(vd) : null;
        if (!link) continue;
        videos.push({ url: link, poster: vd.image, credit: vd.user.name, creditUrl: vd.url });
        taken++;
      }
      await sleep(400);
    }
    next[group] = { photos: photos.slice(0, PHOTOS), videos: videos.slice(0, VIDEOS) };
    console.log(`${group}: 写真${next[group].photos.length}枚 / 動画${next[group].videos.length}本`);
  }

  if (dryRun) {
    console.log("\n(dry-run: manifest.json は書き換えていません)");
    return;
  }
  const path = join(process.cwd(), "lib/placeholders/manifest.json");
  writeFileSync(path, JSON.stringify({ ...current, ...next }, null, 2) + "\n");
  console.log(`\n${path} を更新しました。コミットして反映してください。`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
