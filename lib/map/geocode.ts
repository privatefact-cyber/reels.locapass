export type GeocodeResult = { lat: number; lng: number };

/**
 * 地図の検索窓から呼ぶジオコーディング。入力の形で問い合わせ先を変える。
 *
 * - 住所らしい入力(「東京都新宿区歌舞伎町2-14-5」のように都道府県や番地を含む)
 *   → 国土地理院(GSI)。番地レベルまで正確に解決できる。
 * - 地名だけの入力(「東京」「歌舞伎町」「Kabukicho」)
 *   → Nominatim(OSM)。GSIは住所検索なので地名単体だと全国の小字まで拾ってしまい、
 *     先頭が意図しない場所になる(「東京」で1226件返り先頭が北海道札幌市東区、
 *     「大阪」で青森県の大阪山)。Nominatimは重要度順に並ぶため地名に強く、
 *     ローマ字入力もこちらで拾える。
 *
 * どちらも無料枠での利用が前提。Nominatimは1リクエスト/秒の制限があるので、
 * 検索回数が増えてきたら有料ジオコーダへの差し替えを検討すること。
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;

  const looksLikeAddress = /[都道府県郡市区町村]/.test(q) || /\d/.test(q);
  const providers = looksLikeAddress ? [geocodeGsi, geocodeNominatim] : [geocodeNominatim, geocodeGsi];

  for (const provider of providers) {
    try {
      const hit = await provider(q);
      if (hit) return hit;
    } catch {
      // 片方が落ちていてももう片方で拾えるので握りつぶす。
    }
  }
  return null;
}

async function geocodeGsi(query: string): Promise<GeocodeResult | null> {
  const res = await fetch(
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return null;
  const hits = (await res.json()) as {
    geometry?: { coordinates?: [number, number] };
    properties?: { title?: string };
  }[];
  if (!hits?.length) return null;

  // 入力で始まる住所を優先する(GSIは関連度順に並ばないため、先頭をそのまま使わない)。
  const hit = hits.find((h) => (h.properties?.title ?? "").startsWith(query)) ?? hits[0];
  const coords = hit?.geometry?.coordinates;
  return coords ? { lng: coords[0], lat: coords[1] } : null;
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return null;
  const hits = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = hits?.[0];
  return hit?.lat && hit?.lon ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}
