"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hashDob, hashName, hashPhone } from "@/lib/blacklist/identifier";

async function checkCastRisk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { legalName, phone, birthDate }: { legalName: string; phone: string; birthDate: string },
) {
  if (!legalName || !phone) return null;

  const [phoneHash, nameHash, dobHash] = await Promise.all([
    hashPhone(phone),
    hashName(legalName),
    birthDate ? hashDob(birthDate.replace(/-/g, "")) : Promise.resolve(null),
  ]);

  const { data, error } = await supabase
    .rpc("locapass_check_person_risk", {
      p_phone_hash: phoneHash,
      p_name_hash: nameHash,
      p_dob_hash: dobHash as string,
      p_target_type: "cast",
    })
    .single();

  if (error) return null;
  return data;
}

/**
 * キャスト管理(LUXELA本家 app/dashboard/cast/actions.ts と同じ動き)を locapass_cast_members につないだ版。
 * 操作できるのはその店舗の shop_admin 以上(DBの locapass_is_shop_admin。RLS・RPC側でも同じ判定)。
 * 与信照会は本家 check_person_risk と同じ方式で、照会先は locapass の照会データ(locapass_check_person_risk)。
 */
async function requireShopAdmin(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: ok } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!ok) throw new Error("この店舗のパートナーを管理する権限がありません");
  return supabase;
}

function castPath(shopId: string, castId?: string) {
  return castId ? `/dashboard/shop/${shopId}/cast/${castId}` : `/dashboard/shop/${shopId}/cast`;
}

export async function addCast(shopId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const prText = String(formData.get("pr_text") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalNameKana = String(formData.get("legal_name_kana") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) throw new Error("氏名は必須です");

  const risk = await checkCastRisk(supabase, { legalName, phone, birthDate });
  const { data, error } = await supabase
    .from("locapass_cast_members")
    .insert({
      shop_id: shopId,
      name,
      age: ageRaw ? Number(ageRaw) : null,
      pr_text: prText || null,
      legal_name: legalName || null,
      legal_name_kana: legalNameKana || null,
      birth_date: birthDate || null,
      phone: phone || null,
      address: address || null,
      id_check_match_level: risk?.match_level ?? null,
      id_check_hit_count: risk?.hit_count ?? null,
      id_checked_at: risk ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`パートナー登録に失敗しました: ${error.message}`);

  revalidatePath(castPath(shopId));
  redirect(castPath(shopId, data.id));
}

export async function updateCastProfile(shopId: string, castId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const prText = String(formData.get("pr_text") ?? "").trim();
  const t = String(formData.get("t") ?? "").trim();
  const b = String(formData.get("b") ?? "").trim();
  const w = String(formData.get("w") ?? "").trim();
  const h = String(formData.get("h") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalNameKana = String(formData.get("legal_name_kana") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) throw new Error("氏名は必須です");

  const risk = await checkCastRisk(supabase, { legalName, phone, birthDate });
  const { data, error } = await supabase
    .from("locapass_cast_members")
    .update({
      name,
      age: ageRaw ? Number(ageRaw) : null,
      pr_text: prText || null,
      sizes: { t, b, w, h },
      legal_name: legalName || null,
      legal_name_kana: legalNameKana || null,
      birth_date: birthDate || null,
      phone: phone || null,
      address: address || null,
      ...(risk
        ? {
            id_check_match_level: risk.match_level,
            id_check_hit_count: risk.hit_count,
            id_checked_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", castId)
    .eq("shop_id", shopId)
    .select("id");

  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("更新に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(castPath(shopId, castId));
}

export type InviteCastState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function inviteCast(shopId: string, castId: string, _prevState: InviteCastState): Promise<InviteCastState> {
  let supabase;
  try {
    supabase = await requireShopAdmin(shopId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "権限がありません" };
  }
  const { data, error } = await supabase.rpc("locapass_create_cast_invite", { p_cast_id: castId }).single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "招待の発行に失敗しました" };
  }
  revalidatePath(castPath(shopId, castId));
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password };
}

/** 投稿用マイページへのマジックリンクを失効させ、新しいトークンを発行し直す(リンク漏洩時など)。 */
export async function regenerateCastLoginToken(shopId: string, castId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { error } = await supabase.rpc("locapass_regenerate_cast_login_token", { p_cast_id: castId });
  if (error) throw new Error(`投稿用リンクの再発行に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

/** キャストの削除(本家には無いが、shop_admin が所属キャストを削除できるという権限仕様に対応)。 */
export async function deleteCast(shopId: string, castId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_cast_members")
    .delete()
    .eq("id", castId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`パートナーの削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("パートナーの削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(castPath(shopId));
  redirect(castPath(shopId));
}

// ---------- 身分証画像(本家 setIdDocument / deleteIdDocument。locapass-id-documents バケット) ----------
export async function setIdDocument(shopId: string, castId: string, path: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_cast_members")
    .update({ id_document_path: path })
    .eq("id", castId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`身分証画像の登録に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("身分証画像の登録に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(castPath(shopId, castId));
}

export async function deleteIdDocument(shopId: string, castId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data: cast } = await supabase
    .from("locapass_cast_members")
    .select("id_document_path")
    .eq("id", castId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (cast?.id_document_path) {
    await supabase.storage.from("locapass-id-documents").remove([cast.id_document_path]);
  }
  const { error } = await supabase
    .from("locapass_cast_members")
    .update({ id_document_path: null })
    .eq("id", castId)
    .eq("shop_id", shopId);
  if (error) throw new Error(`身分証画像の削除に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

// ---------- 写真(本家 addPhoto / deletePhoto。locapass-cast-media バケット + locapass_media) ----------
export async function addPhoto(shopId: string, castId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("画像URLを入力してください");

  const { error } = await supabase.from("locapass_media").insert({
    cast_id: castId,
    shop_id: shopId,
    url,
    display_order: 0,
  });
  if (error) throw new Error(`画像の登録に失敗しました: ${error.message}`);

  // アイコン(avatar_url)が未設定なら、最初に登録した写真をデフォルトのアイコンにする(本家と同じ)。
  const { data: cast } = await supabase
    .from("locapass_cast_members")
    .select("avatar_url")
    .eq("id", castId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (cast && !cast.avatar_url) {
    await supabase.from("locapass_cast_members").update({ avatar_url: url }).eq("id", castId).eq("shop_id", shopId);
  }
  revalidatePath(castPath(shopId, castId));
}

export async function deletePhoto(shopId: string, castId: string, mediaId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { error } = await supabase.from("locapass_media").delete().eq("id", mediaId).eq("shop_id", shopId);
  if (error) throw new Error(`画像の削除に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

// ---------- 出勤(本家 addSchedule / deleteSchedule。locapass_schedules) ----------
export async function addSchedule(shopId: string, castId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const isWorking = formData.get("is_working_today") === "on";
  if (!date) throw new Error("日付は必須です");

  const { data: cast } = await supabase
    .from("locapass_cast_members")
    .select("id")
    .eq("id", castId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!cast) throw new Error("対象のパートナーが見つかりません");

  const { error } = await supabase.from("locapass_schedules").insert({
    cast_id: castId,
    date,
    start_time: startTime || null,
    end_time: endTime || null,
    is_working_today: isWorking,
  });
  if (error) throw new Error(`出勤予定の登録に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

export async function deleteSchedule(shopId: string, castId: string, scheduleId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { error } = await supabase.from("locapass_schedules").delete().eq("id", scheduleId).eq("cast_id", castId);
  if (error) throw new Error(`出勤予定の削除に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

// ---------- キャストのリールとコメント(本家 deleteCastReel / deleteCastReelComment) ----------
export async function deleteCastReel(shopId: string, castId: string, reelId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_reels")
    .delete()
    .eq("id", reelId)
    .eq("shop_id", shopId)
    .select("id");
  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }
  revalidatePath(castPath(shopId, castId));
  revalidatePath(`/dashboard/shop/${shopId}/reels`);
  revalidatePath("/");
}

/** 自店舗キャストのリールについたコメント(客のコメント/キャストの返信どちらも)を、店舗が代理でソフト削除する。 */
export async function deleteCastReelComment(shopId: string, castId: string, commentId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_reel_comments")
    .update({ is_deleted: true })
    .eq("id", commentId)
    .select("id");
  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つからないか、権限がありません"}`);
  }
  revalidatePath(castPath(shopId, castId));
}
