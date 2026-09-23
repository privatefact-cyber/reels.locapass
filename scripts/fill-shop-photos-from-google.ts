/**
 * カバー画像が未設定の店舗に、Google Places API (New) の写真を正規に紐付ける一括スクリプト。
 *
 * 使い方:
 *   npx tsx scripts/fill-shop-photos-from-google.ts --dry-run --out /tmp/photos.json   # 書き込まず結果確認
 *   npx tsx scripts/fill-shop-photos-from-google.ts                                    # 実際に反映
 *   npx tsx scripts/fill-shop-photos-from-google.ts --limit 5                          # 試し打ち
 *   npx tsx scripts/fill-shop-photos-from-google.ts --portal oarai                     # 特定ポータルのみ
 *
 * 必要な環境変数(.env.local): GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 対象: status='active' かつ cover_url が空で、google_place_id 未設定の店舗。
 *       lizand(ダミー店舗のポータル)は除外する。
 *
 * やること: 店舗名+住所でText Search → 同一店舗か検証(座標が近い/店名が一致) →
 *   place_id・写真リソース名・撮影者クレジットを保存し、cover_url を中継URL
 *   (https://locapass.net/api/place-photo/{shopId})にする。画像自体は保存しない。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import {
  COVER_URL_PREFIX,
  distanceMeters,
  searchPlace,
  toAttribution,
  type PlaceCandidate,
} from "../lib/places/googlePlaces";
import type { Database } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const EXCLUDED_PORTAL_SLUGS = ["lizand"];
const MAX_DISTANCE_M = 400;
const REQUEST_INTERVAL_MS = 300;

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");
const limit = arg("--limit") ? Number(arg("--limit")) : undefined;
const onlyPortal = arg("--portal");
const outPath = arg("--out");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_()（）「」【】]/g, "");

/** 店名がほぼ一致するか(どちらかがどちらかを含む)。 */
function nameMatches(shopName: string, place: PlaceCandidate) {
  const a = norm(shopName);
  const b = norm(place.displayName?.text ?? "");
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

/** 候補のうち、同一店舗と判断できて写真があるものを選ぶ。 */
function pickCandidate(
  shop: { name: string; lat: number | null; lng: number | null },
  candidates: PlaceCandidate[],
) {
  for (const c of candidates) {
    if (!c.photos?.length) continue;
    const near =
      shop.lat != null && shop.lng != null && c.location
        ? distanceMeters({ lat: shop.lat, lng: shop.lng }, c.location) <= MAX_DISTANCE_M
        : null;
    // 座標がある店は「近い かつ 店名が似ている」、座標が無い店は店名一致のみで採用する。
    if (near === false) continue;
    if (!nameMatches(shop.name, c)) continue;
    return c;
  }
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: portals } = await supabase.from("locapass_portals").select("id, slug");
  const slugById = new Map((portals ?? []).map((p) => [p.id, p.slug as string]));

  const { data: shops, error } = await supabase
    .from("locapass_shops")
    .select("id, portal_id, name, address, area, lat, lng, cover_url, google_place_id")
    .eq("status", "active")
    .is("google_place_id", null)
    .order("portal_id");
  if (error) throw error;

  let targets = (shops ?? []).filter((s) => {
    const slug = slugById.get(s.portal_id) ?? "";
    if (EXCLUDED_PORTAL_SLUGS.includes(slug)) return false;
    if (onlyPortal && slug !== onlyPortal) return false;
    return !s.cover_url;
  });
  if (limit) targets = targets.slice(0, limit);
  console.log(`対象 ${targets.length} 店舗${dryRun ? " (dry-run)" : ""}`);

  const results: Record<string, unknown>[] = [];
  let ok = 0;
  for (const shop of targets) {
    const slug = slugById.get(shop.portal_id);
    const query = [shop.name, shop.address ?? shop.area].filter(Boolean).join(" ");
    try {
      const near = shop.lat != null && shop.lng != null ? { lat: shop.lat, lng: shop.lng } : null;
      const hit = pickCandidate(shop, await searchPlace(query, near));
      if (!hit) {
        console.log(`SKIP  [${slug}] ${shop.name} — 一致する写真付きの候補なし`);
        results.push({ id: shop.id, portal: slug, name: shop.name, status: "no_match" });
      } else {
        const photo = hit.photos![0];
        const attribution = toAttribution(photo);
        console.log(`OK    [${slug}] ${shop.name} → ${hit.displayName?.text} (${attribution.name})`);
        results.push({
          id: shop.id, portal: slug, name: shop.name, status: "ok",
          matched: hit.displayName?.text, address: hit.formattedAddress, place_id: hit.id,
        });
        ok++;
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("locapass_shops")
            .update({
              google_place_id: hit.id,
              google_photo_name: photo.name,
              cover_image_attribution: attribution,
              cover_url: `${COVER_URL_PREFIX}${shop.id}`,
            })
            .eq("id", shop.id)
            .select("id");
          if (upErr) throw upErr;
        }
      }
    } catch (e) {
      console.error(`ERROR [${slug}] ${shop.name}`, e);
      results.push({ id: shop.id, portal: slug, name: shop.name, status: "error" });
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  console.log(`完了: 写真を紐付け ${ok} / ${targets.length}`);
  if (outPath) writeFileSync(outPath, JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
