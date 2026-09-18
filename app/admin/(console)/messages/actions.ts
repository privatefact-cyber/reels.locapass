"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// 運営から全ユーザーへの一斉お知らせ。件数が多くなる想定のため、notifications直挿入で
// user_idを一括select+insertする(1ユーザー=1行)。カテゴリ別トグルの対象外(常時配信)。
export async function sendAdminBroadcast(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim() || null;
  if (!title) throw new Error("タイトルを入力してください");

  const supabase = createAdminClient();

  const { data: users, error: usersError } = await supabase.from("user_profiles").select("id");
  if (usersError) throw new Error(usersError.message);
  if (!users || users.length === 0) return;

  const { error } = await supabase.from("notifications").insert(
    users.map((u) => ({
      user_id: u.id,
      type: "admin_message" as const,
      title,
      body: body || null,
      url,
    })),
  );

  if (error) throw new Error(error.message);
}
