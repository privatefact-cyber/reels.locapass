"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
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
    .rpc("check_person_risk", {
      p_phone_hash: phoneHash,
      p_name_hash: nameHash,
      p_dob_hash: dobHash as string,
      p_target_type: "cast",
    })
    .single();

  if (error) return null;
  return data;
}

export async function addCast(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const name = String(formData.get("name") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const prText = String(formData.get("pr_text") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalNameKana = String(formData.get("legal_name_kana") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) throw new Error("氏名は必須です");

  const supabase = await createClient();
  const risk = await checkCastRisk(supabase, { legalName, phone, birthDate });

  const { data, error } = await supabase
    .from("cast_members")
    .insert({
      shop_id: shop.id,
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

  if (error) throw new Error(`キャスト登録に失敗しました: ${error.message}`);

  revalidatePath("/dashboard/cast");
  redirect(`/dashboard/cast/${data.id}`);
}

export async function updateCastProfile(castId: string, formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

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

  const supabase = await createClient();
  const risk = await checkCastRisk(supabase, { legalName, phone, birthDate });

  const { error } = await supabase
    .from("cast_members")
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
    .eq("id", castId);

  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function setIdDocument(castId: string, path: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cast_members")
    .update({ id_document_path: path })
    .eq("id", castId);
  if (error) throw new Error(`身分証画像の登録に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function deleteIdDocument(castId: string) {
  const supabase = await createClient();
  const { data: cast } = await supabase
    .from("cast_members")
    .select("id_document_path")
    .eq("id", castId)
    .single();

  if (cast?.id_document_path) {
    await supabase.storage.from("id-documents").remove([cast.id_document_path]);
  }

  const { error } = await supabase
    .from("cast_members")
    .update({ id_document_path: null })
    .eq("id", castId);
  if (error) throw new Error(`身分証画像の削除に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function addPhoto(castId: string, shopId: string, formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("画像URLを入力してください");

  const supabase = await createClient();
  const { error } = await supabase.from("media").insert({
    cast_id: castId,
    shop_id: shopId,
    url,
    display_order: 0,
  });

  if (error) throw new Error(`画像の登録に失敗しました: ${error.message}`);

  // アイコン(avatar_url)が未設定なら、最初に登録した写真をデフォルトのアイコンにする。
  const { data: cast } = await supabase.from("cast_members").select("avatar_url").eq("id", castId).single();
  if (cast && !cast.avatar_url) {
    await supabase.from("cast_members").update({ avatar_url: url }).eq("id", castId);
  }

  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function deletePhoto(castId: string, mediaId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("media").delete().eq("id", mediaId);
  if (error) throw new Error(`画像の削除に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function addSchedule(castId: string, formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const isWorking = formData.get("is_working_today") === "on";

  if (!date) throw new Error("日付は必須です");

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").insert({
    cast_id: castId,
    date,
    start_time: startTime || null,
    end_time: endTime || null,
    is_working_today: isWorking,
  });

  if (error) throw new Error(`出勤予定の登録に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function deleteSchedule(castId: string, scheduleId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);
  if (error) throw new Error(`出勤予定の削除に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}

export async function deleteCastReel(castId: string, reelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reels").delete().eq("id", reelId).select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }

  revalidatePath(`/dashboard/cast/${castId}`);
  revalidatePath("/dashboard/reels");
  revalidatePath("/");
}

/** 自店舗キャストのリールについたコメント(客のコメント/キャストの返信どちらも)を、店舗スタッフが代理でソフト削除する。 */
export async function deleteCastReelComment(castId: string, commentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reel_comments")
    .update({ is_deleted: true })
    .eq("id", commentId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つからないか、権限がありません"}`);
  }

  revalidatePath(`/dashboard/cast/${castId}`);
}

export type InviteCastState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function inviteCast(
  castId: string,
  _prevState: InviteCastState,
): Promise<InviteCastState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_cast_invite", { p_cast_id: castId })
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "招待の発行に失敗しました" };
  }

  revalidatePath(`/dashboard/cast/${castId}`);
  return {
    status: "success",
    loginEmail: data.login_email,
    initialPassword: data.initial_password,
  };
}

/** 投稿用マイページへのマジックリンクを失効させ、新しいトークンを発行し直す(リンク漏洩時など)。 */
export async function regenerateCastLoginToken(castId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_cast_login_token", { p_cast_id: castId });
  if (error) throw new Error(`投稿用リンクの再発行に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/cast/${castId}`);
}
