"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deleteCommentAsAdmin(commentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reel_comments")
    .update({ is_deleted: true })
    .eq("id", commentId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }
  revalidatePath("/admin/comments");
}

/** 悪質ユーザーの投稿権限をサイト全体で剥奪する(以後、新しいコメントを一切投稿できなくなる)。 */
export async function banUser(userId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("banned_users")
    .upsert({ user_id: userId, reason: reason || null, banned_by: user?.id ?? null });

  if (error) throw new Error(`BANに失敗しました: ${error.message}`);
  revalidatePath("/admin/comments");
}

export async function unbanUser(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("banned_users").delete().eq("user_id", userId);
  if (error) throw new Error(`BAN解除に失敗しました: ${error.message}`);
  revalidatePath("/admin/comments");
}
