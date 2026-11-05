import type { SupabaseClient } from "@supabase/supabase-js";
import { signPetImages } from "./db";
import { PET_COLUMNS, type PetRow } from "./types";

export type PetWithImages = PetRow & { avatarUrl: string | null; coverUrl: string | null };

export async function withPetImages(pets: PetRow[]): Promise<PetWithImages[]> {
  const signed = await signPetImages(pets.flatMap((p) => [p.avatar_path, p.cover_path]));
  return pets.map((p) => ({
    ...p,
    avatarUrl: p.avatar_path ? (signed.get(p.avatar_path) ?? null) : null,
    coverUrl: p.cover_path ? (signed.get(p.cover_path) ?? null) : null,
  }));
}

/** 本人の子の一覧(並び順→登録順) */
export async function getMyPets(supabase: SupabaseClient): Promise<PetWithImages[]> {
  const { data } = await supabase.from("locapass_pets").select(PET_COLUMNS).order("sort_order").order("created_at");
  return withPetImages((data ?? []) as PetRow[]);
}
