import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// VAPID鍵の設定はモジュール読み込み時ではなく初回送信時に遅延させる。
// ビルド時(Next.jsのpage data収集)は環境変数が無いホストでも通す必要があるため。
let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    "mailto:support@locapass.net",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * 指定ユーザーの全購読端末にPush通知を送る。送信先のトリガー(フォロー中キャストの
 * 出勤登録・新着リールなど)は未実装で、これは送信基盤のみ。呼び出し側は
 * lib/supabase/admin のservice roleクライアントが使える文脈(APIルート・cronなど)から呼ぶこと。
 *
 * 410/404(購読が失効している)を返した端末は購読情報をその場で削除し、
 * 二度と無駄な送信をしないようにする。
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureVapidConfigured();
  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase
    .from("locapass_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (!subscriptions || subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify(payload),
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("locapass_push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}
