import type { SupabaseClient } from "@supabase/supabase-js";

export const HERE_TTL_HOURS = 48;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function box(center: { lat: number; lng: number }, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((center.lat * Math.PI) / 180));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

/**
 * 迷子アラートを届ける「近くの人」を探す。
 * - 散歩エリア(最大3か所)のどれかが半径内にある人(迷子アラートの受け取りをオフにした人は除く)
 * - 「いまいる場所でも受け取る」をオンにしていて、48時間以内にいた場所が半径内の人
 */
export async function findNearbyRecipients(admin: SupabaseClient, center: { lat: number; lng: number }, radiusKm: number): Promise<Set<string>> {
  const b = box(center, radiusKm);
  const out = new Set<string>();

  const { data: areas } = await admin
    .from("locapass_pet_walk_areas")
    .select("user_id, lat, lng")
    .gte("lat", b.minLat)
    .lte("lat", b.maxLat)
    .gte("lng", b.minLng)
    .lte("lng", b.maxLng)
    .limit(5000);
  const nearByArea = new Set<string>();
  for (const a of areas ?? []) {
    if (distanceKm(center, { lat: a.lat, lng: a.lng }) <= radiusKm) nearByArea.add(a.user_id as string);
  }
  if (nearByArea.size) {
    // 受け取りをオフにした人を除く(設定の行がない人は既定のオン)
    const ids = [...nearByArea];
    for (let i = 0; i < ids.length; i += 500) {
      const { data: off } = await admin.from("locapass_pet_owner_settings").select("user_id").in("user_id", ids.slice(i, i + 500)).eq("lost_alert_opt_in", false);
      const offSet = new Set((off ?? []).map((o) => o.user_id as string));
      for (const id of ids.slice(i, i + 500)) if (!offSet.has(id)) out.add(id);
    }
  }

  const since = new Date(Date.now() - HERE_TTL_HOURS * 3600_000).toISOString();
  const { data: here } = await admin
    .from("locapass_pet_owner_settings")
    .select("user_id, here_lat, here_lng")
    .eq("here_alert_opt_in", true)
    .gte("here_at", since)
    .gte("here_lat", b.minLat)
    .lte("here_lat", b.maxLat)
    .gte("here_lng", b.minLng)
    .lte("here_lng", b.maxLng)
    .limit(5000);
  for (const h of here ?? []) {
    if (h.here_lat != null && h.here_lng != null && distanceKm(center, { lat: h.here_lat, lng: h.here_lng }) <= radiusKm) out.add(h.user_id as string);
  }
  return out;
}

/** コメント管理でBANされた人は、迷子・通報・目撃も投稿できない */
export async function isBannedUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("locapass_banned_users").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
