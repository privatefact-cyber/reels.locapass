"use server";

import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

// 運営から全会員への一斉お知らせ(本家 sendAdminBroadcast と同じく1会員=1行の locapass_notifications)。
// 本家は service role で直接挿入するが、locapass では super_admin の確認と挿入を
// DB関数 locapass_send_admin_broadcast にまとめている。
export async function sendAdminBroadcast(formData: FormData) {
  await requireRootAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim() || null;
  if (!title) throw new Error("タイトルを入力してください");

  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_send_admin_broadcast", {
    p_title: title,
    p_body: body || undefined,
    p_url: url ?? undefined,
  });
  if (error) throw new Error(error.message);
}
