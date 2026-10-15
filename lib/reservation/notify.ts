import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

type Type = "reservation_request" | "reservation_confirmed" | "reservation_declined" | "reservation_cancelled";

/** 予約の通知を、相手の通知一覧に入れ、VAPID鍵があれば端末プッシュも送る(失敗しても予約処理は止めない)。 */
export async function notifyUsers(userIds: string[], n: { type: Type; title: string; body: string; url: string }) {
  if (userIds.length === 0) return;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("locapass_notifications").insert(
    userIds.map((user_id) => ({ user_id, type: n.type, title: n.title, body: n.body, url: n.url, push_dispatched_at: now })),
  );
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    await Promise.all(userIds.map((id) => sendPushToUser(id, { title: n.title, body: n.body, url: n.url }).catch(() => {})));
  }
}

/**
 * 店舗の管理者(オーナー)へ通知する。
 * 【LINE通知の拡張点】店舗のLINE(公式アカウント等)へ「受ける/断る」を送る場合は、ここに追加する。
 */
export async function notifyShopAdmins(shopId: string, n: { type: Type; title: string; body: string; url: string }) {
  const admin = createAdminClient();
  const { data } = await admin.from("locapass_shop_admins").select("user_id").eq("shop_id", shopId);
  await notifyUsers((data ?? []).map((r) => r.user_id), n);
}
