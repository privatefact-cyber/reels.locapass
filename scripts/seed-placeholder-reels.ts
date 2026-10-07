/**
 * リールが1本も無い店舗に、Pixabayの無料動画を「イメージ映像」のダミーリールとして入れる(フィードの見た目を整える用)。
 * 本物の投稿が入ったら --remove でまとめて消せる。ダミーは is_placeholder=true で見分け、キャプションにも
 * 「【イメージ映像】」と明記する。閲覧はインサイトに数えない。
 *
 * 使い方(先に scripts/fetch-placeholder-media.ts で動画を集め、public/placeholders/ をコミット・デプロイしておく。
 *       動画ファイルが本番に無いうちに入れると、再生できないリールになる):
 *   npx tsx scripts/seed-placeholder-reels.ts --dry-run             # 対象の店舗を表示するだけ
 *   npx tsx scripts/seed-placeholder-reels.ts --portal mito         # 指定ポータルの店舗だけ
 *   npx tsx scripts/seed-placeholder-reels.ts                       # リールが無い全店舗(上限 --limit 既定100)
 *   npx tsx scripts/seed-placeholder-reels.ts --remove              # ダミーリールをすべて削除
 *   npx tsx scripts/seed-placeholder-reels.ts --remove-for-shops-with-real-reels   # 本物のリールが入った店舗のダミーだけ削除
 *
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 対象: status='active' で、公開中のリール(ダミー以外)が1本も無い店舗。lizand(ダミー店舗)は含める。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { pickPlaceholder } from "../lib/placeholders/pick";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (f: string) => process.argv.includes(f);
const dryRun = has("--dry-run");
const onlyPortal = arg("--portal");
const limit = Number(arg("--limit") ?? 100);
// manifestのURLは /placeholders/... の相対パス(public/ に置いたファイル)。DBには本番ドメインの絶対URLで保存する。
const BASE_URL = (arg("--base-url") ?? "https://locapass.net").replace(/\/$/, "");
const abs = (u: string | null) => (u && u.startsWith("/") ? `${BASE_URL}${u}` : u);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const db = createClient(url, serviceKey);

  if (has("--remove")) {
    const { count, error } = await db.from("locapass_reels").delete({ count: "exact" }).eq("is_placeholder", true);
    if (error) throw error;
    console.log(`ダミーリールを ${count ?? 0} 本削除しました`);
    return;
  }

  if (has("--remove-for-shops-with-real-reels")) {
    const { data: real } = await db
      .from("locapass_reels")
      .select("shop_id")
      .eq("is_placeholder", false)
      .eq("status", "publish")
      .eq("reel_type", "permanent")
      .not("shop_id", "is", null);
    const shopIds = [...new Set((real ?? []).map((r) => r.shop_id as string))];
    if (shopIds.length === 0) return console.log("対象なし");
    const { count, error } = await db
      .from("locapass_reels")
      .delete({ count: "exact" })
      .eq("is_placeholder", true)
      .in("shop_id", shopIds);
    if (error) throw error;
    console.log(`本物のリールがある店舗のダミーを ${count ?? 0} 本削除しました`);
    return;
  }

  const { data: shops, error } = await db
    .from("locapass_shops")
    .select("id, name, category, portal_id, portal:locapass_portals ( slug )")
    .eq("status", "active");
  if (error) throw error;

  const { data: existing } = await db
    .from("locapass_reels")
    .select("shop_id")
    .eq("status", "publish")
    .eq("reel_type", "permanent")
    .not("shop_id", "is", null);
  const hasReel = new Set((existing ?? []).map((r) => r.shop_id as string));

  const targets = (shops ?? [])
    .filter((s) => !hasReel.has(s.id))
    .filter((s) => {
      const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
      return !onlyPortal || (portal as { slug?: string } | null)?.slug === onlyPortal;
    })
    .slice(0, limit);

  console.log(`対象 ${targets.length} 店舗${dryRun ? "(dry-run: 何も書き込みません)" : ""}`);

  let created = 0;
  let skipped = 0;
  const now = Date.now();
  for (const [i, shop] of targets.entries()) {
    const pick = pickPlaceholder(shop.category, shop.id, { allowVideo: true });
    if (!pick || pick.kind !== "video") {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`- ${shop.name}: ${pick.credit} / ${pick.source}`);
      continue;
    }
    const { error: insertError } = await db.from("locapass_reels").insert({
      portal_id: shop.portal_id,
      shop_id: shop.id,
      video_url: abs(pick.url),
      poster_url: abs(pick.poster),
      caption: `【イメージ映像】${shop.name}の雰囲気イメージです(ダミー映像・撮影: ${pick.credit} / ${pick.source})`,
      author_name: "イメージ映像",
      reel_type: "permanent",
      status: "publish",
      is_placeholder: true,
      is_comments_enabled: false,
      // 同じ時刻に並ばないよう、少しずつずらして投稿日時にする。
      published_at: new Date(now - i * 60 * 1000).toISOString(),
    });
    if (insertError) {
      console.error(`- ${shop.name}: 失敗 ${insertError.message}`);
      continue;
    }
    created++;
  }

  console.log(`\n完了: 作成 ${created} / 動画が無くスキップ ${skipped}`);
  if (skipped > 0) console.log("→ 先に scripts/fetch-placeholder-media.ts で動画を集めてください");
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
