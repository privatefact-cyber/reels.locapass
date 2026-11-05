import { petAdmin, signPetImages } from "./db";
import { maskContacts } from "./privacy";

/** 「見つけました」通報のうち、誰にでも見せてよい部分 */
export type PublicFoundReport = {
  id: string;
  kind: "protected" | "sighted";
  species: "dog" | "cat" | "other";
  photoUrl: string | null;
  lat: number;
  lng: number;
  address: string | null;
  foundAt: string;
  features: string | null;
  handedTo: string | null;
  /** 連絡方法そのものは返さない(検索に出すページのHTMLに載せないため)。表示は revealFoundContact で */
  hasContact: boolean;
  status: "open" | "resolved";
  createdAt: string;
  isReporter: boolean;
};

export const FOUND_KIND_LABEL = { protected: "保護しています", sighted: "見かけました" } as const;
export const SPECIES_LABEL = { dog: "ワンコ", cat: "ネコ", other: "ペット" } as const;
export const SPECIES_EMOJI = { dog: "🐶", cat: "🐱", other: "🐾" } as const;

/** 受付中の通報(既定は14日以内)。id指定なら終了済みも返す。 */
export async function getFoundReports(opts: { id?: string; viewerId?: string | null; days?: number; limit?: number; near?: { lat: number; lng: number; km: number } } = {}): Promise<PublicFoundReport[]> {
  const admin = petAdmin();
  let q = admin
    .from("locapass_pet_found_reports")
    .select("id, reporter_id, kind, species, photo_path, lat, lng, address, found_at, features, handed_to, contact_note, status, created_at")
    .is("hidden_at", null) // 運営が非表示にしたものは出さない
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.id) q = q.eq("id", opts.id);
  else q = q.eq("status", "open").gte("created_at", new Date(Date.now() - (opts.days ?? 14) * 86_400_000).toISOString());
  if (opts.near) {
    const dLat = opts.near.km / 111;
    const dLng = opts.near.km / (111 * Math.cos((opts.near.lat * Math.PI) / 180));
    q = q.gte("lat", opts.near.lat - dLat).lte("lat", opts.near.lat + dLat).gte("lng", opts.near.lng - dLng).lte("lng", opts.near.lng + dLng);
  }
  const { data } = await q;
  if (!data?.length) return [];
  const signed = await signPetImages(data.map((r) => r.photo_path as string | null), 6 * 3600);
  return data.map((r) => ({
    id: r.id,
    kind: r.kind,
    species: r.species,
    photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
    lat: r.lat,
    lng: r.lng,
    address: maskContacts(r.address).text,
    foundAt: r.found_at,
    features: maskContacts(r.features).text,
    handedTo: maskContacts(r.handed_to).text,
    hasContact: Boolean(r.contact_note),
    status: r.status,
    createdAt: r.created_at,
    isReporter: Boolean(opts.viewerId && opts.viewerId === r.reporter_id),
  }));
}
