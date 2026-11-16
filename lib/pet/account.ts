import type { SupabaseClient } from "@supabase/supabase-js";
import { PET_BUCKET } from "./db";

/**
 * ロカわんの「アカウント削除」(App Store の審査で必須)。
 *
 * ロカわんの会員は、LOCAPASS・LUXELA・見守りSOS などと同じ会員(auth.users)を共有している。
 *  - 役割が無い一般会員  → アカウントごと完全に削除(会員にひもづく行はDBの CASCADE で消える)
 *  - 役割がある人        → ロカわんのデータだけ削除し、アカウントは残す(権限・請求・契約の記録を壊さないため)
 * 役割の有無は DB関数 locapass_account_roles(service_role専用)で調べる。
 */

export async function listAccountRoles(admin: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data, error } = await admin.rpc("locapass_account_roles", { p_user: userId });
  if (error || !Array.isArray(data)) {
    console.error("[pet-account] roles_lookup_failed", error?.message);
    return null; // 調べられないときは消さない
  }
  return data as string[];
}

/** バケットの中の「prefix/」以下を、フォルダの中まで含めてすべて消す */
async function removeAllUnder(admin: SupabaseClient, bucket: string, prefix: string) {
  const files: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 6) return;
    for (let offset = 0; ; offset += 1000) {
      const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (!data?.length) break;
      for (const item of data) {
        // id が無いものはフォルダ
        if (item.id) files.push(`${dir}/${item.name}`);
        else await walk(`${dir}/${item.name}`, depth + 1);
      }
      if (data.length < 1000) break;
    }
  };
  await walk(prefix, 0);
  for (let i = 0; i < files.length; i += 100) await admin.storage.from(bucket).remove(files.slice(i, i + 100));
  return files.length;
}

/** snap(地図の写真)の投稿を、写真のファイルごと消す(本人の投稿だけ) */
async function removeSnapPosts(admin: SupabaseClient, userId: string) {
  const { data: posts } = await admin.from("area_photo_posts").select("id, image_url").eq("member_id", userId).limit(1000);
  const marker = "/map-photos/";
  const paths: string[] = [];
  for (const p of posts ?? []) {
    const url = p.image_url as string | null;
    if (url?.includes(marker)) paths.push(url.slice(url.indexOf(marker) + marker.length));
  }
  if (posts?.length) await admin.from("area_photo_posts").delete().eq("member_id", userId);
  for (let i = 0; i < paths.length; i += 100) await admin.storage.from("map-photos").remove(paths.slice(i, i + 100));
}

/** ロカわんのデータだけを消す(アカウントは残す) */
export async function deletePetData(admin: SupabaseClient, userId: string): Promise<string[]> {
  const errors: string[] = [];
  const del = async (table: string, column: string) => {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) errors.push(`${table}: ${error.message}`);
  };
  // 犬を消すと、書類・通院・日誌・フォローなど犬にひもづくものも消える(DBのCASCADE)
  await del("locapass_pets", "owner_id");
  await del("locapass_pet_diary_entries", "owner_id");
  await del("locapass_pet_diary_likes", "user_id");
  await del("locapass_pet_documents", "owner_id");
  await del("locapass_pet_medical_records", "owner_id");
  await del("locapass_pet_lost_reports", "owner_id");
  await del("locapass_pet_found_reports", "reporter_id");
  await del("locapass_pet_found_claims", "claimant_id");
  await del("locapass_pet_sightings", "reporter_id");
  await del("locapass_pet_follows", "follower_id");
  await del("locapass_pet_walk_areas", "user_id");
  await del("locapass_pet_ai_scans", "user_id");
  await del("locapass_pet_owner_settings", "user_id");
  await removeAllUnder(admin, PET_BUCKET, userId);
  await removeSnapPosts(admin, userId);
  return errors;
}

export type DeleteAccountResult = { ok: true; mode: "full" | "data_only" } | { ok: false; error: string };

export async function deletePetAccountForUser(admin: SupabaseClient, userId: string): Promise<DeleteAccountResult> {
  const roles = await listAccountRoles(admin, userId);
  if (roles === null) return { ok: false, error: "削除の準備に失敗しました。少し時間をおいてお試しください" };

  // 先に、ロカわんのデータ(写真・書類のファイルを含む)を消す
  const errors = await deletePetData(admin, userId);
  if (errors.length) {
    console.error("[pet-account] data_delete_partial", errors);
    return { ok: false, error: "一部のデータを削除できませんでした。もう一度お試しください" };
  }

  if (roles.length > 0) return { ok: true, mode: "data_only" };

  // 役割が無い一般会員: アカウントごと削除する
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // 想定外の理由で消せない場合も、ロカわんのデータはすでに消えている。アカウントは残して知らせる。
    console.error("[pet-account] delete_user_failed", error.message);
    return { ok: true, mode: "data_only" };
  }
  return { ok: true, mode: "full" };
}
