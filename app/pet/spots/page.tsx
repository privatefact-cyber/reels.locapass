import { getPetViewer } from "@/lib/pet/db";
import { SpotsMapExplorer } from "@/components/pet/SpotsMapExplorer";

export const dynamic = "force-dynamic";

/** おでかけ: ペット施設と、ペットと一緒に行けるお店(全画面地図+下から引き出す一覧。見えている範囲だけ読み込む) */
export default async function PetSpotsPage() {
  const viewer = await getPetViewer();
  let origin: { lat: number; lng: number } | null = null;
  if (viewer) {
    const { data: a } = await viewer.supabase.from("locapass_pet_walk_areas").select("lat, lng").order("created_at").limit(1).maybeSingle();
    if (a) origin = { lat: a.lat, lng: a.lng };
  }
  return <SpotsMapExplorer origin={origin} />;
}
