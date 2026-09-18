import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

// notificationsテーブルへのINSERTをきっかけに、DBトリガー(dispatch_push_for_notification、
// pg_net経由)から呼ばれる。呼び出し元を特定の秘密鍵で認証する代わりに、
// push_dispatched_atで冪等性を持たせている(UUIDは推測困難な上、二重に呼ばれても
// 「まだなら送る→送った印を付ける」だけなので実害がない)。
//
// admin_message(運営からのお知らせ)だけはカテゴリ別トグルの対象外で常に配信する。
const ALWAYS_ON_TYPE = "admin_message";

type NotificationType = "new_cast" | "new_event" | "new_shop_reel" | "new_cast_reel" | "shop_message" | "admin_message";

const PREFERENCE_COLUMN: Partial<Record<NotificationType, string>> = {
  new_cast: "new_cast",
  new_event: "new_event",
  new_shop_reel: "new_shop_reel",
  new_cast_reel: "new_cast_reel",
  shop_message: "shop_message",
};

export async function POST(request: Request) {
  const { notification_id: notificationId } = (await request.json()) ?? {};
  if (typeof notificationId !== "string") {
    return NextResponse.json({ error: "notification_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: notification } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, url, push_dispatched_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (!notification) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (notification.push_dispatched_at) {
    return NextResponse.json({ ok: true, alreadyDispatched: true });
  }

  const type = notification.type as NotificationType;
  let enabled = true;

  if (type !== ALWAYS_ON_TYPE) {
    const column = PREFERENCE_COLUMN[type];
    if (column) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("new_cast, new_event, new_shop_reel, new_cast_reel, shop_message")
        .eq("user_id", notification.user_id)
        .maybeSingle();
      // 設定行が無い(バックフィル漏れ等)場合はデフォルトのON扱いにする。
      enabled = prefs ? Boolean(prefs[column as keyof typeof prefs]) : true;
    }
  }

  if (enabled) {
    await sendPushToUser(notification.user_id, {
      title: notification.title,
      body: notification.body ?? "",
      url: notification.url ?? "/notifications",
    });
  }

  await supabase.from("notifications").update({ push_dispatched_at: new Date().toISOString() }).eq("id", notification.id);

  return NextResponse.json({ ok: true, pushed: enabled });
}
