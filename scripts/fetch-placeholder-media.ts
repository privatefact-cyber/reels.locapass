/**
 * 写真/動画が無い店舗の見た目を整えるための、無料の「イメージ写真・動画」をPixabayから集める。
 * ファイルは public/placeholders/{group}/ に保存し(Pixabayは外部からの直接参照を禁止しているため、自前で配信する)、
 * 一覧とクレジットを lib/placeholders/manifest.json に書き出す。写真は1280px幅・軽量JPEGに縮める。
 * 店舗ごとに別の写真を割り当てられるよう、店舗数より多めに集める(目視で選別してから scripts/assign-placeholders.ts)。
 *
 * 使い方(PixabayのAPIキーは https://pixabay.com/api/docs/ にログインすると無料で表示される):
 *   .env.local に  PIXABAY_API_KEY=xxxxxxxx  を追加してから
 *   npx tsx scripts/fetch-placeholder-media.ts --dry-run   # 取得内容を表示だけ(保存・manifest更新なし)
 *   npx tsx scripts/fetch-placeholder-media.ts             # 写真をダウンロードして manifest.json の photos を更新(動画は既存のまま)
 *   npx tsx scripts/fetch-placeholder-media.ts --append    # 既存の写真は残し、目標枚数に足りない分だけ追加する(選別済みの写真と割り当てを変えない)
 *   npx tsx scripts/fetch-placeholder-media.ts --videos 1  # 動画も取り直す(1グループあたりの本数)
 *
 * 不要な素材は lib/placeholders/blocklist.json にPixabayのIDを書くと、次回から取得しない。
 * 費用: 無料(1分100回まで。間隔を空けて呼ぶ)。
 * 規約: Pixabayの素材は商用利用でき、クレジットは必須ではない。出所は manifest に残し、画面の「i」から見られる。
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import sharp from "sharp";
import current from "../lib/placeholders/manifest.json";
import blocklist from "../lib/placeholders/blocklist.json";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const VIDEOS = arg("--videos", 0);
const APPEND = process.argv.includes("--append");
const MAX_VIDEO_SECONDS = 20;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;

/** グループごとの目標枚数(店舗数より多め。目視で選別して減らす)と検索語(英語のほうが当たりが良い)。 */
const GROUPS: Record<string, { target: number; queries: string[] }> = {
  food: {
    target: 170,
    queries: [
      "cafe interior", "coffee shop", "restaurant interior", "japanese restaurant", "ramen", "sushi", "izakaya",
      "bar counter", "pasta", "cake dessert", "bakery bread", "yakiniku", "tempura", "udon", "japanese tea", "pizza",
      "steak", "salad", "curry", "hamburger", "breakfast", "cocktail", "beer glass", "sandwich", "fried chicken",
      "tonkatsu", "seafood", "bento", "pancake", "ice cream", "dumplings", "okonomiyaki", "soba noodles", "wine glass",
      "whisky", "japanese sweets", "donut", "latte art", "rice bowl", "soup", "grilled fish", "brunch", "hot pot", "cheese board",
    ],
  },
  other: {
    target: 60,
    queries: ["japan city street", "night street japan", "modern building", "train station", "street market", "city park", "old town street", "architecture interior", "urban skyline", "shrine town"],
  },
  beauty: { target: 22, queries: ["hair salon", "barber", "spa", "nail art", "massage", "flower shop", "bouquet", "florist"] },
  pet: { target: 22, queries: ["dog", "puppy", "cat", "pet cafe", "dog park"] },
  shop: { target: 10, queries: ["boutique shop", "shopping street", "market stall", "souvenir shop"] },
  stay: { target: 10, queries: ["hotel room", "hotel lobby", "ryokan", "onsen"] },
  tour: { target: 22, queries: ["japan scenery", "japan temple", "mountain landscape", "castle japan", "garden japan", "waterfall"] },
};

const VIDEO_QUERIES: Record<string, string[]> = {
  food: ["coffee shop", "ramen noodles"],
  shop: ["clothes shop"],
  tour: ["japan scenery"],
  stay: ["hotel room"],
  pet: ["dog playing", "puppy"],
  beauty: ["hair salon"],
  other: ["japan city street"],
};

type Entry = { url: string; poster?: string | null; credit: string; creditUrl: string; source: string };
type Found = Entry & { id: number; large: string };
type Hit = { id: number; pageURL: string; user: string; largeImageURL: string };
type VideoFile = { url: string; size: number; thumbnail: string };
type VideoHit = { id: number; pageURL: string; user: string; duration: number; videos: Record<string, VideoFile | undefined> };

const KEY = process.env.PIXABAY_API_KEY;
const UA = { "User-Agent": "Mozilla/5.0 (placeholder-fetch)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://pixabay.com/api/${path}&key=${KEY}&safesearch=true`, { headers: UA });
  if (!res.ok) throw new Error(`Pixabay ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}
async function getBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`download ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!KEY) throw new Error(".env.local に PIXABAY_API_KEY が必要です(https://pixabay.com/api/docs/ にログインすると表示されます)");
  const list = blocklist as { photoIds: number[]; videoIds: number[] };
  const blockedPhotos = new Set(list.photoIds);
  const blockedVideos = new Set(list.videoIds);

  const next: Record<string, { photos: Entry[]; videos: Entry[] }> = {};
  for (const [group, { target, queries }] of Object.entries(GROUPS)) {
    const dir = join(process.cwd(), "public/placeholders", group);
    const existing = APPEND ? ((current as Record<string, { photos: Entry[] }>)[group]?.photos ?? []) : [];
    const seen = new Set<number>(existing.map((e) => Number(e.url.match(/p-(\d+)\.jpg/)?.[1])).filter(Boolean));
    const photos: Found[] = [];
    const goal = Math.max(0, target - existing.length);
    const perQuery = Math.max(3, Math.ceil((goal / queries.length) * 1.3));

    for (const q of queries) {
      if (photos.length >= goal) break;
      const r = await api<{ hits: Hit[] }>(`?q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&per_page=${Math.min(200, perQuery * 2)}`);
      let taken = 0;
      for (const hit of r.hits) {
        if (taken >= perQuery || photos.length >= goal) break;
        if (seen.has(hit.id) || blockedPhotos.has(hit.id)) continue;
        seen.add(hit.id);
        taken++;
        photos.push({ url: `/placeholders/${group}/p-${hit.id}.jpg`, credit: hit.user, creditUrl: hit.pageURL, source: "Pixabay", id: hit.id, large: hit.largeImageURL });
      }
      await sleep(700);
    }

    if (!dryRun) {
      mkdirSync(dir, { recursive: true });
      // 今回の一覧に無い古い写真(photo-N.jpg など)は消す。動画ファイル(video-*)は触らない。
      // 追加モードでは既存の写真を消さない。通常モードでは、今回の一覧に無い古い写真を消す。
      if (!APPEND) {
        const keep = new Set(photos.map((p) => `p-${p.id}.jpg`));
        for (const f of readdirSync(dir)) if (!f.startsWith("video-") && !keep.has(f)) rmSync(join(dir, f));
      }
      for (const p of photos) {
        try {
          const buf = await getBuffer(p.large);
          writeFileSync(join(dir, `p-${p.id}.jpg`), await sharp(buf).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer());
        } catch (cause) {
          console.error("download failed", p.id, cause);
        }
        await sleep(150);
      }
    }

    let videos = (current as Record<string, { videos: Entry[] }>)[group]?.videos ?? [];
    if (VIDEOS > 0) {
      videos = [];
      for (const q of VIDEO_QUERIES[group] ?? []) {
        if (videos.length >= VIDEOS) break;
        const v = await api<{ hits: VideoHit[] }>(`videos/?q=${encodeURIComponent(q)}&per_page=20`);
        for (const hit of v.hits) {
          if (videos.length >= VIDEOS) break;
          const f = hit.videos.tiny ?? hit.videos.small;
          if (!f || hit.duration > MAX_VIDEO_SECONDS || f.size > MAX_VIDEO_BYTES || blockedVideos.has(hit.id)) continue;
          const n = videos.length + 1;
          if (!dryRun) {
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, `video-${n}.mp4`), await getBuffer(f.url));
            writeFileSync(join(dir, `video-${n}.jpg`), await getBuffer(f.thumbnail));
          }
          videos.push({ url: `/placeholders/${group}/video-${n}.mp4`, poster: `/placeholders/${group}/video-${n}.jpg`, credit: hit.user, creditUrl: hit.pageURL, source: "Pixabay" });
        }
        await sleep(700);
      }
    }

    next[group] = {
      photos: [...existing, ...photos.map((p) => ({ url: p.url, credit: p.credit, creditUrl: p.creditUrl, source: p.source }))],
      videos,
    };
    console.log(`${group}: 写真${next[group].photos.length}枚(今回追加${photos.length}) / 動画${videos.length}本`);
  }

  if (dryRun) {
    console.log("\n(dry-run: ダウンロードも manifest.json の更新もしていません)");
    return;
  }
  const path = join(process.cwd(), "lib/placeholders/manifest.json");
  writeFileSync(path, JSON.stringify({ ...current, ...next }, null, 2) + "\n");
  console.log(`\n${path} を更新しました。目視で選別 → assign-placeholders → コミット・反映してください。`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
