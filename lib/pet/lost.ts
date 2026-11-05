import { petAdmin, signPetImages } from "./db";
import { maskContacts } from "./privacy";

/** 迷子マップ・名刺ページで、誰にでも見せてよい迷子情報(連絡先は飼い主が公開を選んだもの) */
export type PublicLostReport = {
  id: string;
  petId: string;
  petName: string;
  breed: string | null;
  tagCode: string;
  lastSeenAt: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  features: string | null;
  photoUrl: string | null;
  /** 連絡先そのものは返さない(検索に出すページのHTMLに載せないため)。あるかどうかだけ。表示は revealLostContact で */
  hasContact: boolean;
  /** 特徴の文中に連絡先が書かれていたら伏せ字にしたかどうか */
  featuresMasked: boolean;
  createdAt: string;
  sightingCount: number;
  isOwner: boolean;
};

export async function getActiveLostReports(
  opts: { viewerId?: string | null; reportId?: string; petId?: string; limit?: number; near?: { lat: number; lng: number; km: number } } = {},
): Promise<PublicLostReport[]> {
  const admin = petAdmin();
  let q = admin
    .from("locapass_pet_lost_reports")
    .select("id, pet_id, owner_id, last_seen_at, last_seen_lat, last_seen_lng, last_seen_address, features, photo_path, contact_phone, contact_line, contact_note, created_at")
    .eq("status", "active")
    .is("hidden_at", null) // 運営が非表示にしたものは出さない
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.reportId) q = q.eq("id", opts.reportId);
  if (opts.petId) q = q.eq("pet_id", opts.petId);
  if (opts.near) {
    const dLat = opts.near.km / 111;
    const dLng = opts.near.km / (111 * Math.cos((opts.near.lat * Math.PI) / 180));
    q = q.gte("last_seen_lat", opts.near.lat - dLat).lte("last_seen_lat", opts.near.lat + dLat).gte("last_seen_lng", opts.near.lng - dLng).lte("last_seen_lng", opts.near.lng + dLng);
  }
  const { data: reports } = await q;
  if (!reports?.length) return [];

  const petIds = [...new Set(reports.map((r) => r.pet_id as string))];
  const [{ data: pets }, { data: sightings }] = await Promise.all([
    admin.from("locapass_pets").select("id, name, breed, tag_code, avatar_path").in("id", petIds),
    admin.from("locapass_pet_sightings").select("lost_report_id").in("lost_report_id", reports.map((r) => r.id)),
  ]);
  const petById = new Map((pets ?? []).map((p) => [p.id as string, p]));
  const counts = new Map<string, number>();
  for (const s of sightings ?? []) counts.set(s.lost_report_id as string, (counts.get(s.lost_report_id as string) ?? 0) + 1);
  const signed = await signPetImages(reports.flatMap((r) => [r.photo_path, petById.get(r.pet_id)?.avatar_path]), 6 * 3600);

  return reports
    .filter((r) => petById.has(r.pet_id))
    .map((r) => {
      const pet = petById.get(r.pet_id)!;
      const photo = (r.photo_path && signed.get(r.photo_path)) || (pet.avatar_path && signed.get(pet.avatar_path)) || null;
      const features = maskContacts(r.features);
      return {
        id: r.id,
        petId: r.pet_id,
        petName: pet.name,
        breed: pet.breed,
        tagCode: pet.tag_code,
        lastSeenAt: r.last_seen_at,
        lat: r.last_seen_lat,
        lng: r.last_seen_lng,
        address: maskContacts(r.last_seen_address).text,
        features: features.text,
        photoUrl: photo,
        hasContact: Boolean(r.contact_phone || r.contact_line || r.contact_note),
        featuresMasked: features.masked,
        createdAt: r.created_at,
        sightingCount: counts.get(r.id) ?? 0,
        isOwner: Boolean(opts.viewerId && opts.viewerId === r.owner_id),
      };
    });
}

/**
 * ヒートマップ用の点(位置だけ。写真・名前・連絡先は含めない)。全国表示のときに使う。
 * 迷子のお知らせ(受付中)と、14日以内の「見つけました」通報。
 */
export async function getLostFoundHeatPoints(): Promise<{ lat: number; lng: number; kind: "lost" | "found" }[]> {
  const admin = petAdmin();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [{ data: lost }, { data: found }] = await Promise.all([
    admin.from("locapass_pet_lost_reports").select("last_seen_lat, last_seen_lng").eq("status", "active").is("hidden_at", null).not("last_seen_lat", "is", null).limit(3000),
    admin.from("locapass_pet_found_reports").select("lat, lng").eq("status", "open").is("hidden_at", null).gte("created_at", since).limit(3000),
  ]);
  return [
    ...(lost ?? []).map((r) => ({ lat: r.last_seen_lat as number, lng: r.last_seen_lng as number, kind: "lost" as const })),
    ...(found ?? []).map((r) => ({ lat: r.lat as number, lng: r.lng as number, kind: "found" as const })),
  ];
}
