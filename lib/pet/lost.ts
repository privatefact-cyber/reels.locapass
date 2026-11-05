import { petAdmin, signPetImages } from "./db";

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
  contactPhone: string | null;
  contactLine: string | null;
  contactNote: string | null;
  createdAt: string;
  sightingCount: number;
  isOwner: boolean;
};

export async function getActiveLostReports(opts: { viewerId?: string | null; reportId?: string; petId?: string; limit?: number } = {}): Promise<PublicLostReport[]> {
  const admin = petAdmin();
  let q = admin
    .from("locapass_pet_lost_reports")
    .select("id, pet_id, owner_id, last_seen_at, last_seen_lat, last_seen_lng, last_seen_address, features, photo_path, contact_phone, contact_line, contact_note, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.reportId) q = q.eq("id", opts.reportId);
  if (opts.petId) q = q.eq("pet_id", opts.petId);
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
      return {
        id: r.id,
        petId: r.pet_id,
        petName: pet.name,
        breed: pet.breed,
        tagCode: pet.tag_code,
        lastSeenAt: r.last_seen_at,
        lat: r.last_seen_lat,
        lng: r.last_seen_lng,
        address: r.last_seen_address,
        features: r.features,
        photoUrl: photo,
        contactPhone: r.contact_phone,
        contactLine: r.contact_line,
        contactNote: r.contact_note,
        createdAt: r.created_at,
        sightingCount: counts.get(r.id) ?? 0,
        isOwner: Boolean(opts.viewerId && opts.viewerId === r.owner_id),
      };
    });
}
