import { getPetViewer } from "@/lib/pet/db";
import { getPetSpots } from "@/lib/pet/spots";
import { SpotsExplorer } from "@/components/pet/SpotsExplorer";

export const dynamic = "force-dynamic";

/** おでかけ: ペット施設と、ペットと一緒に行けるお店(LOCAPASSの店舗データ) */
export default async function PetSpotsPage() {
  const [viewer, spots] = await Promise.all([getPetViewer(), getPetSpots()]);
  let origin: { lat: number; lng: number; label: string } | null = null;
  if (viewer) {
    const { data: a } = await viewer.supabase.from("locapass_pet_walk_areas").select("lat, lng").order("created_at").limit(1).maybeSingle();
    if (a) origin = { lat: a.lat, lng: a.lng, label: "散歩エリア" };
  }
  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">おでかけ</h1>
        <p className="mt-1 text-sm text-[#9C8273]">ペット施設と、ワンコと一緒に行けるお店。</p>
      </div>
      <SpotsExplorer spots={spots} origin={origin} />
    </div>
  );
}
