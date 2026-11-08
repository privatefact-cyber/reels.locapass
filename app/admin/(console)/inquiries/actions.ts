"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStatus, TYPE_LABEL, type InquiryType } from "@/lib/lpInquiry/shared";
import { isMailConfigured, sendInquiryMail } from "@/lib/lpInquiry/mail";

const MAX_BODY = 5000;

function back(id: string, tone: "ok" | "ng", message: string): never {
  redirect(`/admin/inquiries/${id}?tone=${tone}&notice=${encodeURIComponent(message)}`);
}

function refresh(id: string) {
  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
}

/** 状態を変える(新規 / 対応中 / 返信済み / 完了)。 */
export async function setInquiryStatus(id: string, formData: FormData) {
  await requireRootAdmin();
  const status = String(formData.get("status") ?? "");
  if (!isStatus(status)) back(id, "ng", "不正な状態です");
  // 0件でもエラーにならないので.select()で確認する。
  const { data, error } = await (createAdminClient() as any).from("locapass_lp_inquiries").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) back(id, "ng", `状態を変えられませんでした: ${error?.message ?? "対象が見つかりません"}`);
  refresh(id);
  back(id, "ok", "状態を変えました");
}

async function recordMessage(id: string, kind: "reply_email" | "reply_manual" | "note", body: string, userId: string | null, toEmail: string | null) {
  const admin = createAdminClient() as any;
  const { error } = await admin.from("locapass_lp_inquiry_messages").insert({ inquiry_id: id, kind, body, to_email: toEmail, created_by: userId });
  if (error) throw new Error(error.message);
  if (kind !== "note") {
    const { data, error: updateError } = await admin
      .from("locapass_lp_inquiries")
      .update({ status: "replied", last_replied_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (updateError || !data?.length) throw new Error(updateError?.message ?? "状態を更新できませんでした");
  }
}

/** メールで返信する(宛先はフォームに入力されたメールアドレス)。送れたときだけ、履歴に残して「返信済み」にする。 */
export async function replyByEmail(id: string, formData: FormData) {
  const scope = await requireRootAdmin();
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  if (!body) back(id, "ng", "返信の内容を入力してください");
  if (!isMailConfigured()) back(id, "ng", "メール送信はまだ設定されていません。「メールアプリで開く」か「返信済みとして記録」を使ってください");

  const { data: inquiry } = await (createAdminClient() as any).from("locapass_lp_inquiries").select("id, type, email").eq("id", id).maybeSingle();
  if (!inquiry) back(id, "ng", "お問い合わせが見つかりません");
  if (!inquiry.email) back(id, "ng", "連絡先がメールアドレスではないため、メールでは送れません");

  const sent = await sendInquiryMail({ to: inquiry.email, subject: subject || `【LOCAPASS】${TYPE_LABEL[inquiry.type as InquiryType]}のお問い合わせについて`, text: body });
  if (!sent.ok) back(id, "ng", sent.error);
  try {
    await recordMessage(id, "reply_email", body, scope.id, inquiry.email);
  } catch (e) {
    // メールは送れているので、記録に失敗したことを、はっきり伝える(二重に送らないため)。
    back(id, "ng", `メールは送信しましたが、履歴への記録に失敗しました: ${e instanceof Error ? e.message : "不明なエラー"}`);
  }
  refresh(id);
  back(id, "ok", "メールを送信しました");
}

/** 電話・メールアプリなど、この画面の外で返信した内容を記録して「返信済み」にする。 */
export async function recordReply(id: string, formData: FormData) {
  const scope = await requireRootAdmin();
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!body) back(id, "ng", "対応した内容を入力してください");
  try {
    await recordMessage(id, "reply_manual", body, scope.id, null);
  } catch (e) {
    back(id, "ng", `記録に失敗しました: ${e instanceof Error ? e.message : "不明なエラー"}`);
  }
  refresh(id);
  back(id, "ok", "返信済みとして記録しました");
}

/** 社内メモを残す(状態は変えない)。 */
export async function addInquiryNote(id: string, formData: FormData) {
  const scope = await requireRootAdmin();
  const body = String(formData.get("note") ?? "").trim().slice(0, MAX_BODY);
  if (!body) back(id, "ng", "メモを入力してください");
  try {
    await recordMessage(id, "note", body, scope.id, null);
  } catch (e) {
    back(id, "ng", `メモを保存できませんでした: ${e instanceof Error ? e.message : "不明なエラー"}`);
  }
  refresh(id);
  back(id, "ok", "メモを保存しました");
}
