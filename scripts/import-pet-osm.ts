/**
 * ロカわん「おでかけ」用に、OpenStreetMap から日本全国のペット関連の施設を取り込む(locapass_pet_places)。
 * 対象: ドッグラン・動物病院・ペットショップ・トリミング・ペットホテル・しつけ教室・犬OKのカフェ/飲食店(dog=yes/leashed)。
 * どれも店舗・施設として営業しているもので、個人の自宅は含まない(動物取扱業の登録簿は自宅が多いので使わない)。
 * LOCAPASSのお店(locapass_shops)とは別のテーブルなので、LOCAPASSの地図には出ない。
 *
 * 使い方:
 *   npx tsx scripts/import-pet-osm.ts --dry-run   # 取得件数だけ確認(書き込まない)
 *   npx tsx scripts/import-pet-osm.ts             # 取り込み(同じ施設は上書き)
 *
 * データの扱い: OpenStreetMap は ODbL。表示する画面に「© OpenStreetMap contributors」の出典表示が必要
 * (地図の出典表記+施設ページに表示している)。OSMの値は加工せず source='osm' の行として別に持つ。
 * Overpass API(無料・公平利用)を1回だけ叩く。頻繁に回さないこと(月1回程度で十分)。
 * 必要な環境変数(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const DRY = process.argv.includes("--dry-run");
const OVERPASS = "https://overpass-api.de/api/interpreter";
const QUERY = `[out:json][timeout:300];
area["ISO3166-1"="JP"][admin_level=2]->.jp;
(
  nwr["leisure"="dog_park"](area.jp);
  nwr["amenity"="veterinary"](area.jp);
  nwr["shop"="pet"](area.jp);
  nwr["shop"="pet_grooming"](area.jp);
  nwr["amenity"="animal_boarding"](area.jp);
  nwr["amenity"="animal_training"](area.jp);
  nwr["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream)$"]["dog"~"^(yes|leashed)$"](area.jp);
);
out center tags;`;

type El = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function address(t: Record<string, string>): string | null {
  if (t["addr:full"]) return t["addr:full"];
  const parts = [t["addr:province"], t["addr:city"], t["addr:suburb"], t["addr:quarter"], t["addr:neighbourhood"], t["addr:block_number"], t["addr:housenumber"]].filter(Boolean);
  return parts.length ? parts.join("") : null;
}

async function main() {
  console.log("Overpass から取得中…");
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "locapass-pet-import/1.0 (locapass.net)" },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { elements: El[] };

  const rows = json.elements
    .map((e) => {
      const t = e.tags ?? {};
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (lat == null || lng == null) return null;
      const category =
        t.leisure === "dog_park"
          ? "dog_run"
          : t.amenity === "veterinary"
            ? "vet"
            : t.shop === "pet_grooming"
              ? "trimming"
              : t.shop === "pet"
                ? "pet_shop"
                : t.amenity === "animal_boarding"
                  ? "pet_hotel"
                  : t.amenity === "animal_training"
                    ? "training"
                    : "dog_ok";
      const name = t["name:ja"] || t.name || (category === "dog_run" ? "ドッグラン" : null);
      if (!name) return null; // 名前のない施設は、案内しにくいので載せない(ドッグランは「ドッグラン」で載せる)
      return {
        source: "osm",
        source_id: `${e.type}/${e.id}`,
        category,
        name: name.slice(0, 120),
        address: address(t),
        lat,
        lng,
        website: t.website || t["contact:website"] || null,
        opening_hours: t.opening_hours || null,
        attribution: "© OpenStreetMap contributors",
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const byCat = rows.reduce<Record<string, number>>((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {});
  console.log(`取得: ${json.elements.length}件 → 取り込み対象 ${rows.length}件`, byCat);
  if (DRY) return;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("locapass_pet_places").upsert(chunk, { onConflict: "source,source_id" });
    if (error) throw new Error(`保存に失敗: ${error.message}`);
    done += chunk.length;
  }
  console.log(`保存: ${done}件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
