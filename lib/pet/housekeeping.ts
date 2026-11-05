import type { SupabaseClient } from "@supabase/supabase-js";
import { PET_BUCKET } from "./db";
import { notifyPetUser } from "./notify";
import { HERE_TTL_HOURS } from "./recipients";

/**
 * 迷子さがしの後片付け(毎朝のcronから呼ぶ)。個人情報・写真を必要以上に持たないため。
 * 1) 迷子のお知らせ: 最後の確認から30日で「まだ探していますか?」を通知、60日たっても確認がなければ自動で終了(連絡先も消す)
 * 2) 「いまいる場所」: 48時間たったら消す
 * 3) 見つけました通報: 投稿から90日で写真ごと削除
 * 4) 終わった迷子のお知らせ: 終了から90日で写真と目撃情報(写真ごと)を削除
 */
export const LOST_CHECK_DAYS = 30;
export const LOST_AUTO_CLOSE_DAYS = 60;
export const KEEP_DAYS = 90;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function removeFiles(admin: SupabaseClient, paths: (string | null)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  for (let i = 0; i < list.length; i += 100) await admin.storage.from(PET_BUCKET).remove(list.slice(i, i + 100));
}

export async function runPetHousekeeping(admin: SupabaseClient) {
  const result = { checkSent: 0, autoClosed: 0, hereCleared: 0, foundDeleted: 0, lostPhotosCleared: 0 };

  // 1-a) 60日確認がない → 自動終了
  const { data: stale } = await admin
    .from("locapass_pet_lost_reports")
    .update({ status: "closed", resolved_at: new Date().toISOString(), contact_phone: null, contact_line: null, contact_note: null })
    .eq("status", "active")
    .lt("last_confirmed_at", daysAgo(LOST_AUTO_CLOSE_DAYS))
    .select("id, pet_id, owner_id");
  for (const r of stale ?? []) {
    await admin.from("locapass_pets").update({ is_lost: false }).eq("id", r.pet_id);
    await notifyPetUser({
      userId: r.owner_id as string,
      type: "pet_lost_check",
      title: "迷子のお知らせを自動で終了しました",
      body: `${LOST_AUTO_CLOSE_DAYS}日間確認がなかったため、公開していた連絡先も消しました。まだ探している場合は、もう一度お知らせを出してください。`,
      url: `/pet/${r.pet_id}/lost`,
    }).catch((e) => console.error("[pet-housekeeping] close notify failed", e));
  }
  result.autoClosed = stale?.length ?? 0;

  // 1-b) 30日確認がない → 「まだ探していますか?」(1回だけ)
  const { data: toCheck } = await admin
    .from("locapass_pet_lost_reports")
    .update({ check_sent_at: new Date().toISOString() })
    .eq("status", "active")
    .is("check_sent_at", null)
    .lt("last_confirmed_at", daysAgo(LOST_CHECK_DAYS))
    .select("id, pet_id, owner_id");
  for (const r of toCheck ?? []) {
    await notifyPetUser({
      userId: r.owner_id as string,
      type: "pet_lost_check",
      title: "迷子のお知らせ、まだ探していますか?",
      body: `お知らせから${LOST_CHECK_DAYS}日たちました。まだ探している場合は「探しています」を押してください。押さないと${LOST_AUTO_CLOSE_DAYS - LOST_CHECK_DAYS}日後に自動で終了し、連絡先も消えます。`,
      url: `/pet/${r.pet_id}/lost`,
    }).catch((e) => console.error("[pet-housekeeping] check notify failed", e));
  }
  result.checkSent = toCheck?.length ?? 0;

  // 2) 48時間たった「いまいる場所」を消す
  const { data: cleared } = await admin
    .from("locapass_pet_owner_settings")
    .update({ here_lat: null, here_lng: null, here_at: null })
    .lt("here_at", new Date(Date.now() - HERE_TTL_HOURS * 3600_000).toISOString())
    .select("user_id");
  result.hereCleared = cleared?.length ?? 0;

  // 3) 90日たった「見つけました」通報を写真ごと削除
  const { data: oldFound } = await admin.from("locapass_pet_found_reports").select("id, photo_path").lt("created_at", daysAgo(KEEP_DAYS)).limit(1000);
  if (oldFound?.length) {
    await removeFiles(admin, oldFound.map((f) => f.photo_path as string | null));
    await admin.from("locapass_pet_found_reports").delete().in("id", oldFound.map((f) => f.id));
    result.foundDeleted = oldFound.length;
  }

  // 4) 終了から90日たった迷子のお知らせの写真と目撃情報を削除
  const { data: oldLost } = await admin
    .from("locapass_pet_lost_reports")
    .select("id, photo_path")
    .neq("status", "active")
    .lt("resolved_at", daysAgo(KEEP_DAYS))
    .limit(1000);
  if (oldLost?.length) {
    const ids = oldLost.map((r) => r.id as string);
    const { data: sightings } = await admin.from("locapass_pet_sightings").select("id, photo_path").in("lost_report_id", ids);
    await removeFiles(admin, [...oldLost.map((r) => r.photo_path as string | null), ...(sightings ?? []).map((s) => s.photo_path as string | null)]);
    if (sightings?.length) await admin.from("locapass_pet_sightings").delete().in("id", sightings.map((s) => s.id));
    const withPhoto = oldLost.filter((r) => r.photo_path).map((r) => r.id);
    if (withPhoto.length) await admin.from("locapass_pet_lost_reports").update({ photo_path: null }).in("id", withPhoto);
    result.lostPhotosCleared = withPhoto.length + (sightings?.length ?? 0);
  }
  return result;
}
