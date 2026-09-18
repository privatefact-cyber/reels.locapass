/**
 * マップAPI(/api/venues, /pins, /search)のCDNキャッシュ。
 *
 * 地図を動かすたびの問い合わせは、同じエリアを見ている人どうしでほぼ同じ結果になる。
 * VercelのCDNに60秒持たせ、その後5分間は古い応答を返しながら裏で取り直す。
 * これで閲覧者が増えてもDBへの問い合わせは「エリア×1分に1回」程度に収まる。
 *
 * キャッシュしてよいのは、ログイン状態に依存しない公開情報だけを返すため
 * (lib/map/getVenues.ts はcookieを読まないクライアントで取得している)。
 * 出勤中表示・店舗の更新は最大1分遅れる。
 */
export const VENUE_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};
