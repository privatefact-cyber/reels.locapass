/**
 * 店舗ごとに「別々の」「その店に合う」イメージ写真を割り当てる(複数店舗で同じ写真を使い回さない)。
 * 店名とカテゴリから店の種類(カフェ/バー/居酒屋/麺/和食/海鮮/焼肉/洋食/宿泊/観光/買い物/美容室/ペット…)を決め、
 * その種類に合う写真だけを使う(コーヒー屋に蕎麦、バーにとんかつ、を避ける)。合う写真が尽きたら、街の風景を使う。
 * 写真の中身の分類は scripts/classify-placeholders.ts(labels.json)。種類と写真の対応は lib/placeholders/shopType.ts。
 *
 * 結果は lib/placeholders/assignments.json に {店舗ID: {photo, reelPhoto, video?}} で保存する。
 *   photo     : 店舗タイル/ヒーローに使う写真
 *   reelPhoto : ダミーリールに使う写真(photo とは別。同じ店のICONタイルとSHOPタイルが同じ写真にならないように)
 *   video     : 動画(各グループで合う店1店舗だけ)
 * 毎回、全店舗を決め直す(店名順で決まるので、店舗が増減しなければ結果は同じ)。
 *
 * 使い方(先に fetch-placeholder-media.ts → classify-placeholders.ts を済ませる):
 *   npx tsx scripts/assign-placeholders.ts --dry-run   # 割り当て状況を表示するだけ
 *   npx tsx scripts/assign-placeholders.ts             # assignments.json を更新
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import manifest from "../lib/placeholders/manifest.json";
import labels from "../lib/placeholders/labels.json";
import type { PlaceholderEntry } from "../lib/placeholders/pick";
import { ALLOWED_PHOTO_LABELS, shopTypeOf, type PhotoLabel, type ShopType } from "../lib/placeholders/shopType";

config({ path: join(process.cwd(), ".env.local"), quiet: true });
const dryRun = process.argv.includes("--dry-run");

type Assignment = { photo: PlaceholderEntry; reelPhoto?: PlaceholderEntry; video?: PlaceholderEntry };
type Group = { photos: PlaceholderEntry[]; videos: PlaceholderEntry[] };
const groups = manifest as Record<string, Group>;
const labelOf = labels as Record<string, string>;

/** 飲食以外の店の種類 → 写真グループ。 */
const GROUP_OF_TYPE: Partial<Record<ShopType, string>> = { stay: "stay", tour: "tour", shopping: "shop", pet: "pet", hair: "beauty" };
/**
 * 店の種類によっては、分類(ラベル)だけでは粗いので、特に合う写真(PixabayのID)を先に使う。
 * 例: 焼肉店には肉の写真、美容室には美容室・理容室の写真(マッサージやネイルではなく)。
 */
const PREFERRED_PHOTO_IDS: Partial<Record<ShopType, number[]>> = {
  grill: [2806566, 6222139, 6351455, 2426889],
  hair: [2521943, 5212059, 3173422, 6797761, 2345701, 2693077, 6964555, 7226341, 6818702],
};

/** 動画のあるグループ → その動画を使ってよい店の種類(動画の中身に合う店だけ)。 */
const VIDEO_FOR: { group: string; type: ShopType }[] = [
  { group: "food", type: "cafe" }, // コーヒー豆の動画
  { group: "shop", type: "shopping" },
  { group: "tour", type: "tour" },
  { group: "stay", type: "stay" },
  { group: "pet", type: "pet" },
  { group: "beauty", type: "hair" },
  { group: "other", type: "other" }, // 夜の街の動画
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const db = createClient(url, serviceKey);
  const { data, error } = await db
    .from("locapass_shops")
    .select("id, name, category, portal:locapass_portals ( slug )")
    .eq("status", "active");
  if (error) throw error;

  const shops = (data ?? [])
    .map((s) => {
      const portal = (Array.isArray(s.portal) ? s.portal[0] : s.portal) as { slug?: string } | null;
      return { id: s.id, name: s.name, portal: portal?.slug ?? "", type: shopTypeOf(s.name, s.category) };
    })
    .sort((a, b) => a.portal.localeCompare(b.portal) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  // 飲食/街の写真: food・other グループの写真を、中身の分類ごとに束ねる(unusableは使わない)。
  const byLabel = new Map<string, PlaceholderEntry[]>();
  for (const g of ["food", "other"]) {
    for (const p of groups[g].photos.slice().sort((a, b) => a.url.localeCompare(b.url))) {
      const l = labelOf[p.url];
      if (!l || l === "unusable") continue;
      byLabel.set(l, [...(byLabel.get(l) ?? []), p]);
    }
  }
  const byGroup = new Map(Object.entries(groups).map(([k, v]) => [k, v.photos.slice().sort((a, b) => a.url.localeCompare(b.url))]));
  const used = new Set<string>();
  const take = (list: PlaceholderEntry[] | undefined) => {
    const p = list?.find((x) => !used.has(x.url));
    if (p) used.add(p.url);
    return p;
  };
  const stats: Record<string, { n: number; matched: number; fallback: number }> = {};

  /** その店に合う、まだ使っていない写真。合うものが無ければ街の風景、それも無ければ観光の風景。 */
  function pickFor(type: ShopType): { photo: PlaceholderEntry; matched: boolean } | null {
    for (const id of PREFERRED_PHOTO_IDS[type] ?? []) {
      const p = take([...byLabel.values(), ...byGroup.values()].flat().filter((x) => x.url.endsWith(`/p-${id}.jpg`)));
      if (p) return { photo: p, matched: true };
    }
    const allowed = ALLOWED_PHOTO_LABELS[type];
    if (allowed) {
      for (const l of allowed) {
        const p = take(byLabel.get(l as PhotoLabel));
        if (p) return { photo: p, matched: true };
      }
    } else if (GROUP_OF_TYPE[type]) {
      const p = take(byGroup.get(GROUP_OF_TYPE[type]!));
      if (p) return { photo: p, matched: true };
    }
    const city = take(byLabel.get("city")) ?? take(byGroup.get("tour"));
    return city ? { photo: city, matched: type === "other" } : null;
  }

  const next: Record<string, Assignment> = {};
  // 1周目: 店舗用の写真。2周目: ダミーリール用の写真(店舗用とは別)。
  for (const pass of ["photo", "reelPhoto"] as const) {
    for (const s of shops) {
      const r = pickFor(s.type);
      stats[s.type] ??= { n: 0, matched: 0, fallback: 0 };
      if (pass === "photo") stats[s.type].n++;
      if (!r) continue;
      if (pass === "photo") {
        next[s.id] = { photo: r.photo };
        r.matched ? stats[s.type].matched++ : stats[s.type].fallback++;
      } else if (next[s.id]) {
        next[s.id].reelPhoto = r.photo;
      }
    }
  }
  // 動画: 動画の中身に合う種類の店のうち、最初の1店舗だけ。
  for (const { group, type } of VIDEO_FOR) {
    const v = groups[group]?.videos[0];
    const owner = shops.find((s) => s.type === type && next[s.id]);
    if (v && owner) next[owner.id].video = v;
  }

  for (const [t, st] of Object.entries(stats)) {
    console.log(`${t}: ${st.n}店舗 / 合う写真 ${st.matched}${st.fallback > 0 ? ` / 街の風景で代用 ${st.fallback}` : ""}`);
  }
  const photos = Object.values(next).flatMap((a) => [a.photo.url, a.reelPhoto?.url].filter(Boolean) as string[]);
  console.log(`\n${Object.keys(next).length}店舗 / 写真${photos.length}枚(重複 ${photos.length - new Set(photos).size})`);
  if (dryRun) return console.log("(dry-run: assignments.json は更新していません)");
  writeFileSync(join(process.cwd(), "lib/placeholders/assignments.json"), JSON.stringify(next, null, 1) + "\n");
  console.log("assignments.json を更新しました");
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
