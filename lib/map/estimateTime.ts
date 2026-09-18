// 2点間の直線距離（km）を求める軽量関数。有料の距離計算APIは使わない
// (Google Distance Matrix等は1リクエストごとに課金され、カード表示のたびに全店舗ぶん
// 叩くと費用が跳ねるため、直線距離+係数補正の概算で十分とする)。
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface EstimatedMinutes {
  carMinutes: number;
  walkMinutes: number | null; // 60分超は表示しないのでnull
}

/** 現在地からvenueまでの概算所要時間(分)。現在地が無ければnullを返す。表示文言は呼び出し側でi18nする。 */
export function estimateTimeFromDistance(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number },
): EstimatedMinutes | null {
  if (!from) return null;
  const distKm = getDistanceKm(from.lat, from.lng, to.lat, to.lng);

  // 車：実走行距離を1.4倍、市街地時速30kmで計算
  const carMinutes = Math.round(((distKm * 1.4) / 30) * 60);
  // 徒歩：実歩行距離を1.3倍、分速80m(時速4.8km)で計算
  const walkMinutes = Math.round(((distKm * 1.3) / 4.8) * 60);

  return {
    carMinutes,
    walkMinutes: walkMinutes > 60 ? null : walkMinutes,
  };
}
