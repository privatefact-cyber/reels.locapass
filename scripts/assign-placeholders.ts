/**
 * 店舗ごとに「別々の」イメージ写真を割り当てる(複数店舗で同じ写真を使い回さない)。
 * 結果は lib/placeholders/assignments.json に {店舗ID: {photo, video?}} で保存する。
 * すでに割り当て済みの店舗は変えない(見た目が毎回変わらないように)。新しい店舗だけ、余っている写真から割り当てる。
 * 動画は、各グループで1店舗だけに割り当てる(同じ動画を複数店舗で使わないため)。
 *
 * 使い方(先に scripts/fetch-placeholder-media.ts と目視の選別を済ませる):
 *   npx tsx scripts/assign-placeholders.ts --dry-run   # 割り当て状況を表示するだけ
 *   npx tsx scripts/assign-placeholders.ts             # assignments.json を更新
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 対象: status='active' の全店舗。写真がグループの店舗数に足りないときは警告を出す(不足分は使い回しになる)。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import manifest from "../lib/placeholders/manifest.json";
import current from "../lib/placeholders/assignments.json";
import { groupKeyOf, type PlaceholderEntry } from "../lib/placeholders/pick";

config({ path: join(process.cwd(), ".env.local"), quiet: true });
const dryRun = process.argv.includes("--dry-run");

type Assignment = { photo: PlaceholderEntry; video?: PlaceholderEntry };
type Group = { photos: PlaceholderEntry[]; videos: PlaceholderEntry[] };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const db = createClient(url, serviceKey);

  const { data: shops, error } = await db
    .from("locapass_shops")
    .select("id, name, category, portal:locapass_portals ( slug )")
    .eq("status", "active");
  if (error) throw error;

  const groups = manifest as Record<string, Group>;
  const prev = current as Record<string, Assignment>;
  const next: Record<string, Assignment> = {};

  const byGroup = new Map<string, { id: string; name: string; portal: string }[]>();
  for (const s of shops ?? []) {
    const portal = (Array.isArray(s.portal) ? s.portal[0] : s.portal) as { slug?: string } | null;
    const key = groupKeyOf(s.category);
    byGroup.set(key, [...(byGroup.get(key) ?? []), { id: s.id, name: s.name, portal: portal?.slug ?? "" }]);
  }

  for (const [key, list] of byGroup) {
    const pool = groups[key] ?? groups.other;
    list.sort((a, b) => a.portal.localeCompare(b.portal) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const validUrls = new Set(pool.photos.map((p) => p.url));
    const used = new Set<string>();
    // 既存の割り当て(写真がまだ存在するもの)はそのまま残す。
    for (const s of list) {
      const a = prev[s.id];
      if (a && validUrls.has(a.photo.url) && !used.has(a.photo.url)) {
        next[s.id] = a;
        used.add(a.photo.url);
      }
    }
    const free = pool.photos.filter((p) => !used.has(p.url));
    let reused = 0;
    for (const s of list) {
      if (next[s.id]) continue;
      const photo = free.shift() ?? pool.photos[reused++ % Math.max(1, pool.photos.length)];
      if (photo) next[s.id] = { photo };
    }
    // 動画は、そのグループで最初の1店舗だけ(既に誰かが持っていればそのまま)。
    const videoOwner = list.find((s) => next[s.id]?.video) ?? list[0];
    if (videoOwner && pool.videos[0] && !next[videoOwner.id].video) next[videoOwner.id] = { ...next[videoOwner.id], video: pool.videos[0] };
    console.log(`${key}: 店舗${list.length} / 写真${pool.photos.length}${reused > 0 ? ` ⚠ 写真が足りず${reused}店舗が使い回し` : ""}`);
  }

  if (dryRun) return console.log("\n(dry-run: assignments.json は更新していません)");
  writeFileSync(join(process.cwd(), "lib/placeholders/assignments.json"), JSON.stringify(next, null, 1) + "\n");
  console.log(`\n${Object.keys(next).length} 店舗分を assignments.json に保存しました`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
