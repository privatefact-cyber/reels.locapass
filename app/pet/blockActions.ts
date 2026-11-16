"use server";

import { revalidatePath } from "next/cache";
import { getPetViewer, petAdmin } from "@/lib/pet/db";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 投稿(対象の種類とID)から、投稿した人のIDをサーバー側でだけ調べる(他人のIDを画面に出さない) */
async function authorOf(targetType: "lost" | "found" | "diary", targetId: string): Promise<string | null> {
  const admin = petAdmin();
  if (targetType === "lost") {
    const { data } = await admin.from("locapass_pet_lost_reports").select("owner_id").eq("id", targetId).maybeSingle();
    return (data?.owner_id as string | undefined) ?? null;
  }
  if (targetType === "found") {
    const { data } = await admin.from("locapass_pet_found_reports").select("reporter_id").eq("id", targetId).maybeSingle();
    return (data?.reporter_id as string | null | undefined) ?? null;
  }
  const { data } = await admin.from("locapass_pet_diary_entries").select("owner_id").eq("id", targetId).maybeSingle();
  return (data?.owner_id as string | undefined) ?? null;
}

/**
 * 投稿した人をブロックする(App Storeの審査ガイドライン1.2)。
 * LOCAPASSと共通のブロック(locapass_user_blocks)に入れる。ブロックすると、この人の投稿はこちらの画面に出なくなり、
 * お互いのフォロー(ロカわん・LOCAPASS)も外れる。
 */
export async function blockPetAuthor(targetType: "lost" | "found" | "diary", targetId: string): Promise<Result> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  if (!UUID.test(targetId)) return { ok: false, error: "対象が見つかりません" };
  const authorId = await authorOf(targetType, targetId);
  if (!authorId) return { ok: false, error: "この投稿は、ログインなしで投稿されたため、ブロックできません。不適切な場合は「報告」を押してください" };
  if (authorId === viewer.userId) return { ok: false, error: "自分自身はブロックできません" };

  const { error } = await viewer.supabase.rpc("locapass_block_user", { p_user_id: authorId, p_block: true });
  if (error) {
    console.error("[pet-block] block_failed", error.message);
    return { ok: false, error: "ブロックできませんでした。もう一度お試しください" };
  }

  // ロカわんのフォロー(犬どうし)も、お互いに外す
  const admin = petAdmin();
  const [{ data: myPets }, { data: theirPets }] = await Promise.all([
    admin.from("locapass_pets").select("id").eq("owner_id", viewer.userId),
    admin.from("locapass_pets").select("id").eq("owner_id", authorId),
  ]);
  const mine = (myPets ?? []).map((p) => p.id as string);
  const theirs = (theirPets ?? []).map((p) => p.id as string);
  if (mine.length) await admin.from("locapass_pet_follows").delete().eq("follower_id", authorId).in("pet_id", mine);
  if (theirs.length) await admin.from("locapass_pet_follows").delete().eq("follower_id", viewer.userId).in("pet_id", theirs);

  revalidatePath("/pet", "layout");
  return { ok: true };
}

/** ブロックを解除する(設定の「ブロックしている人」から) */
export async function unblockPetUser(userId: string): Promise<Result> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  if (!UUID.test(userId)) return { ok: false, error: "対象が見つかりません" };
  const { error } = await viewer.supabase.rpc("locapass_block_user", { p_user_id: userId, p_block: false });
  if (error) {
    console.error("[pet-block] unblock_failed", error.message);
    return { ok: false, error: "解除できませんでした。もう一度お試しください" };
  }
  revalidatePath("/pet", "layout");
  return { ok: true };
}
