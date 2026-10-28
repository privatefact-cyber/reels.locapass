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

/**
 * 座標 → 住所(日本語表記)。投稿画面で「写真から検出した位置」を住所で見せて、直せるようにするために使う。
 * Nominatim(OSM)の逆引きを使う。番地まで出ない場所もあるので、取れた分だけを都道府県→市区→町丁目→番地の順につなぐ。
 * 取れなかったら null(呼び出し側は入力欄を空のままにして、手入力してもらう)。
 */
const PREFECTURE_BY_JIS: Record<number, string> = {
  1: "北海道", 2: "青森県", 3: "岩手県", 4: "宮城県", 5: "秋田県", 6: "山形県", 7: "福島県", 8: "茨城県", 9: "栃木県", 10: "群馬県",
  11: "埼玉県", 12: "千葉県", 13: "東京都", 14: "神奈川県", 15: "新潟県", 16: "富山県", 17: "石川県", 18: "福井県", 19: "山梨県", 20: "長野県",
  21: "岐阜県", 22: "静岡県", 23: "愛知県", 24: "三重県", 25: "滋賀県", 26: "京都府", 27: "大阪府", 28: "兵庫県", 29: "奈良県", 30: "和歌山県",
  31: "鳥取県", 32: "島根県", 33: "岡山県", 34: "広島県", 35: "山口県", 36: "徳島県", 37: "香川県", 38: "愛媛県", 39: "高知県", 40: "福岡県",
  41: "佐賀県", 42: "長崎県", 43: "熊本県", 44: "大分県", 45: "宮崎県", 46: "鹿児島県", 47: "沖縄県",
};

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=ja&lat=${lat}&lon=${lng}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address;
    if (!a) return null;
    // Nominatimは日本だと都道府県名を返さないことがあるので、ISOコード(JP-13など)から補う。
    const iso = /^JP-(\d{2})$/.exec(a["ISO3166-2-lvl4"] ?? "");
    const prefecture = a.state ?? a.province ?? (iso ? PREFECTURE_BY_JIS[Number(iso[1])] : undefined);
    const parts = [prefecture, a.city ?? a.town ?? a.village, a.city_district, a.suburb, a.quarter, a.neighbourhood, a.house_number];
    // 「神宮前」と「神宮前一丁目」のように、前の要素が後ろの要素に含まれているときは前を省く。
    const clean = parts.filter((p, i): p is string => !!p && !parts.slice(i + 1).some((q) => q && q.includes(p)));
    return clean.length ? clean.join("") : null;
  } catch {
    return null;
  }
}
