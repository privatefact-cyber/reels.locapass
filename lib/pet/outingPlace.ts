import { petAdmin } from "@/lib/pet/db";
import { getPetPlace } from "@/lib/pet/spots";

export type OutingPresetPlace = { kind: "shop" | "place"; id: string; name: string; lat: number; lng: number; address: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** おでかけ・施設ページの「ここで撮った写真を共有」から来たときの場所(施設の登録位置) */
export async function getOutingPresetPlace(placeId?: string, shopId?: string): Promise<OutingPresetPlace | null> {
  if (placeId && UUID.test(placeId)) {
    const p = await getPetPlace(placeId);
    if (p) return { kind: "place", id: p.id, name: p.name, lat: p.lat, lng: p.lng, address: p.address };
  }
  if (shopId && UUID.test(shopId)) {
    const { data } = await petAdmin().from("locapass_shops").select("id, name, address, lat, lng").eq("id", shopId).eq("status", "active").maybeSingle();
    if (data && data.lat != null && data.lng != null) return { kind: "shop", id: data.id as string, name: data.name as string, lat: data.lat as number, lng: data.lng as number, address: (data.address as string | null) ?? null };
  }
  return null;
}
