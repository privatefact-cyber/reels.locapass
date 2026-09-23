// Google Places API (New) の薄いラッパー。公式APIのみを使い、画像の自前保存はしない。
// 保存してよいのは place_id だけ(規約)。写真は表示のたびに取得し直す前提で、
// 写真リソース名(places/{id}/photos/{ref})は期限切れがあり得るので再取得できるようにしておく。

const BASE = "https://places.googleapis.com/v1";

export type PlacePhoto = {
  name: string;
  authorAttributions?: { displayName?: string; uri?: string; photoUri?: string }[];
};

export type PlaceCandidate = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  photos?: PlacePhoto[];
};

export type CoverAttribution = { name: string; uri: string | null };

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY が未設定です");
  return key;
}

/** 店舗名+住所からPlaceを検索する(Text Search)。座標があれば近傍を優先する。 */
export async function searchPlace(
  query: string,
  near?: { lat: number; lng: number } | null,
): Promise<PlaceCandidate[]> {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.photos",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 3,
      ...(near
        ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 500 } } }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places searchText ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { places?: PlaceCandidate[] };
  return json.places ?? [];
}

/** place_idから写真一覧を取り直す(写真リソース名が期限切れのときの復旧用)。 */
export async function fetchPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": "photos" },
  });
  if (!res.ok) throw new Error(`Places details ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { photos?: PlacePhoto[] };
  return json.photos ?? [];
}

/** 写真リソース名から、その時点で有効な画像URI(Google配信の一時URL)を得る。 */
export async function fetchPhotoUri(photoName: string, maxWidthPx = 800): Promise<string | null> {
  const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": apiKey() },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { photoUri?: string };
  return json.photoUri ?? null;
}

/** 写真から撮影者クレジットを作る。 */
export function toAttribution(photo: PlacePhoto): CoverAttribution {
  const a = photo.authorAttributions?.[0];
  return { name: a?.displayName || "Google Maps ユーザー", uri: a?.uri ?? null };
}

/** 2点間の距離(m)。検索結果が本当に同じ店かの検証に使う。 */
export function distanceMeters(a: { lat: number; lng: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.lat);
  const dLng = rad(b.longitude - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 画像として使う写真(先頭=Googleが最も代表的と判断したもの)。 */
export const COVER_URL_PREFIX = "https://locapass.net/api/place-photo/";
