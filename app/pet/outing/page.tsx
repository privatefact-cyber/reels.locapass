import type { Metadata } from "next";
import { requirePetViewer } from "@/lib/pet/db";
import { getOutingPresetPlace } from "@/lib/pet/outingPlace";
import { OutingForm } from "@/components/pet/OutingForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "おでかけを共有", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** おでかけの写真と場所を、地図に共有する(成長日誌とは別)。施設ページから来たときは、その施設の場所を入れた状態で開く。 */
export default async function PetOutingPage({ searchParams }: { searchParams: Promise<{ place?: string; shop?: string }> }) {
  const { place, shop } = await searchParams;
  const self = `/pet/outing${place || shop ? `?${new URLSearchParams({ ...(place && UUID.test(place) ? { place } : {}), ...(shop && UUID.test(shop) ? { shop } : {}) })}` : ""}`;
  const { supabase } = await requirePetViewer(self);
  const [{ data: walk }, presetPlace] = await Promise.all([supabase.from("locapass_pet_walk_areas").select("lat, lng, label"), getOutingPresetPlace(place, shop)]);
  const walkAreas = ((walk ?? []) as { lat: number; lng: number; label: string | null }[]).map((w) => ({ lat: Number(w.lat), lng: Number(w.lng), label: w.label }));
  return <OutingForm walkAreas={walkAreas} presetPlace={presetPlace} />;
}
