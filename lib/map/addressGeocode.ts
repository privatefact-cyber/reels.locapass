/**
 * 日本の店舗住所を座標に変換するための共通処理。
 * 一括スクリプト(scripts/geocode-shops.ts)と管理画面の住所検索の両方から使う。
 */

export type AddressGeocodeResult = {
  lat: number;
  lng: number;
  /** 実際にジオコーダへ投げた文字列(デバッグ・確認用)。 */
  query: string;
  /** 解決した住所表記(GSIが返す正式表記)。 */
  matched?: string;
  provider: "gsi" | "nominatim";
};

/**
 * 全角数字と空白だけを整える。
 * 長音符「ー」のハイフン化はここでは行わない
 * (「六本木クロスタワー」が「クロスタワ-」になるなど、ビル名を壊すため)。
 */
export function normalizeAddress(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 住所から「番地まで」を切り出す。ビル名や階数が付いているとジオコーダが外すため。
 * 例: 「東京都新宿区歌舞伎町2-14-5 新宿グランベルホテル13F」→「東京都新宿区歌舞伎町2-14-5」
 * 番地が無い住所(「東京都新宿区歌舞伎町」)はそのまま返す(町丁目レベルで解決される)。
 */
export function toStreetPart(raw: string): string {
  const s = normalizeAddress(raw)
    // 番地の区切りとして使われる各種ダッシュ(長音符含む)をハイフンに寄せる。
    // ビル名を壊さないよう、この変換は番地の切り出しの中だけで行う。
    .replace(/[‐‑‒–—―ー−]/g, "-")
    .replace(/丁目|番地|番|号/g, "-")
    .replace(/-+/g, "-");
  const m = s.match(/^(.*?\d[\d-]*)(?=\s|$)/);
  if (m) return m[1].replace(/-$/, "");
  return s.split(" ")[0];
}

/**
 * 住所の末尾からビル名と階数を取り出す。
 * 例: 「... 2-14-5 新宿グランベルホテル13F」→ { buildingName: "新宿グランベルホテル", floor: "13F" }
 * 同一ビルの店舗をまとめて見せる機能(マップのカード)がこの値を使う。
 */
export function extractBuilding(raw: string): { buildingName?: string; floor?: string } {
  const s = normalizeAddress(raw);
  const street = toStreetPart(raw);
  // 番地部分を取り除いた残り = ビル名+階数
  const idx = s.indexOf(" ");
  const tail = idx >= 0 ? s.slice(idx + 1).trim() : "";
  if (!tail || street === s) return {};

  // 末尾の階数表記(B1F / 3F / 2F・3F・4F / 地下1階 など)を切り出す
  const floorMatch = tail.match(
    /((?:地下\s*\d+\s*階|B?\d+\s*(?:F|階))(?:\s*[・､、,/]\s*(?:B?\d+\s*(?:F|階)))*)\s*$/i,
  );
  const floor = floorMatch ? floorMatch[1].replace(/\s+/g, "") : undefined;
  const buildingName = (floor ? tail.slice(0, floorMatch!.index).trim() : tail).trim();

  return {
    buildingName: buildingName || undefined,
    floor,
  };
}

async function geocodeGsi(query: string): Promise<AddressGeocodeResult | null> {
  const res = await fetch(
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return null;
  const hits = (await res.json()) as {
    geometry?: { coordinates?: [number, number] };
    properties?: { title?: string };
  }[];
  const hit = hits?.[0];
  const coords = hit?.geometry?.coordinates;
  if (!coords) return null;
  return {
    lng: coords[0],
    lat: coords[1],
    query,
    matched: hit?.properties?.title,
    provider: "gsi",
  };
}

async function geocodeNominatim(query: string): Promise<AddressGeocodeResult | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "luxela.jp map geocoder (contact: admin@luxela.jp)" } },
  );
  if (!res.ok) return null;
  const hits = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const hit = hits?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    query,
    matched: hit.display_name,
    provider: "nominatim",
  };
}

/**
 * 住所文字列 → 座標。
 * 1. 国土地理院(GSI): 日本の住所を番地レベルで解決できる。APIキー不要。
 * 2. Nominatim(OSM): GSIが外したときの保険。ローマ字表記もこちらで拾える。
 * どちらも無料枠前提のため、一括実行時は呼び出し側で必ず間隔を空けること。
 */
export async function geocodeAddress(rawAddress: string): Promise<AddressGeocodeResult | null> {
  const street = toStreetPart(rawAddress);
  if (!street) return null;

  try {
    const gsi = await geocodeGsi(street);
    if (gsi) return gsi;
  } catch {
    // GSIが落ちていてもNominatimで拾えるので握りつぶす。
  }

  try {
    return await geocodeNominatim(street);
  } catch {
    return null;
  }
}
