import { sendPushToUser } from "@/lib/push/send";
import { petAdmin } from "./db";

export type PetNotificationType = "pet_reminder" | "pet_lost_alert" | "pet_follow_request" | "pet_follow_approved" | "pet_sighting" | "pet_found" | "pet_found_claim";

/**
 * LINE公式アカウント(Messaging API)から、連携済みの人へテキストを送る。
 * 鍵(LINE_MESSAGING_CHANNEL_ACCESS_TOKEN)が未設定の環境では何もしない。
 * 成功したら true。友だち追加されていない・ブロックされている等で失敗したら false。
 */
export async function pushLineText(lineUserId: string, text: string): Promise<boolean> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineUserId) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[pet-line] push failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[pet-line] push error", e);
    return false;
  }
}

export function lineConfigured(): boolean {
  return Boolean(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN);
}

const SITE = "https://locapass.net";

/**
 * ワンコ手帳の通知を1件送る。
 * 1) アプリ内のお知らせ(locapass_notifications)に入れる(必ず)
 * 2) 端末プッシュ(鍵がある環境・購読している端末だけ)
 * 3) LINE(連携済みで「LINEで受け取る」がオンの人だけ)
 * 失敗しても呼び出し側の処理は止めない(呼び出し側でcatchする)。
 */
export async function notifyPetUser(n: { userId: string; type: PetNotificationType; title: string; body?: string | null; url: string }) {
  const admin = petAdmin();
  await admin.from("locapass_notifications").insert({
    user_id: n.userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    url: n.url,
    // プッシュはここで直接送るので、DBトリガー側からは送らせない(lib/photo/notify.ts と同じ)
    push_dispatched_at: new Date().toISOString(),
  });

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    await sendPushToUser(n.userId, { title: n.title, body: n.body ?? "", url: n.url }).catch((e) => console.error("[pet] push failed", e));
  }

  const { data: settings } = await admin.from("locapass_pet_owner_settings").select("line_user_id, line_notify").eq("user_id", n.userId).maybeSingle();
  if (settings?.line_user_id && settings.line_notify) {
    const text = [`🐶 ${n.title}`, n.body ?? "", `${SITE}${n.url}`].filter(Boolean).join("\n");
    await pushLineText(settings.line_user_id, text);
  }
}
