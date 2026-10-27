import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

/**
 * エリアフォトの通知(いいね・フォローされたとき)を、相手の通知一覧(locapass_notifications)に1件入れ、
 * 端末へのプッシュ通知も(この関数の中から直接)送る。設定で「写真へのいいね」「フォロー」をオフにした人には
 * プッシュだけ送らない(一覧には残る)。
 *
 * プッシュを、DBトリガー(pg_net→/api/push/dispatch)に任せない理由: そのトリガーは廃止済みの
 * reels.locapass.net を呼んでおり、さらにlocapass.netはVercelのボット対策(チャレンジ)でDBからの
 * 呼び出しが止まるため。ここで直接送り、二重送信を防ぐため push_dispatched_at を入れた状態でINSERTする。
 * VAPID鍵(NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)が未設定の環境では、一覧への通知だけ入る。
 *
 * - 自分自身への通知は入れない。
 * - 同じ人が同じ写真に何度いいねし直しても(取り消して押し直しても)、通知は1回だけ。
 *   重複判定には、通知のurlに「誰が」(by=)を含めて、(相手・種別・url)が同じ通知があるかを使う。
 * - 通知の失敗でいいね/フォロー自体は失敗させない(呼び出し側でcatchする)。
 */

async function actorName(admin: ReturnType<typeof createAdminClient>, id: string): Promise<string> {
  const { data } = await admin.from("locapass_members").select("nickname").eq("id", id).maybeSingle();
  return data?.nickname || "ゲスト";
}

async function insertOnce(
  admin: ReturnType<typeof createAdminClient>,
  n: { userId: string; type: "photo_like" | "photo_follow"; title: string; body: string | null; url: string },
) {
  const { data: dup } = await admin
    .from("locapass_notifications")
    .select("id")
    .eq("user_id", n.userId)
    .eq("type", n.type)
    .eq("url", n.url)
    .limit(1);
  if (dup && dup.length > 0) return;

  // プッシュの設定(行が無い人は既定のオン)。
  const { data: prefs } = await admin
    .from("locapass_notification_preferences")
    .select("photo_like, photo_follow")
    .eq("user_id", n.userId)
    .maybeSingle();
  const pushEnabled = prefs ? Boolean(prefs[n.type]) : true;

  await admin.from("locapass_notifications").insert({
    user_id: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    push_dispatched_at: new Date().toISOString(),
  });

  if (pushEnabled && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    await sendPushToUser(n.userId, { title: n.title, body: n.body ?? "", url: n.url });
  }
}

export async function notifyPhotoLike(likerId: string, postId: string) {
  const admin = createAdminClient();
  const { data: post } = await admin.from("area_photo_posts").select("member_id, spot_name").eq("id", postId).maybeSingle();
  if (!post?.member_id || post.member_id === likerId) return;
  const name = await actorName(admin, likerId);
  await insertOnce(admin, {
    userId: post.member_id,
    type: "photo_like",
    title: `${name}さんがあなたの写真にいいねしました`,
    body: post.spot_name,
    // ?post= でその写真を開く。by= は「誰が」(同じ人の重複通知を防ぐ印)。
    url: `/photo/u/${post.member_id}?post=${postId}&by=${likerId}`,
  });
}

export async function notifyPhotoFollow(followerId: string, followeeId: string) {
  const admin = createAdminClient();
  if (followerId === followeeId) return;
  const name = await actorName(admin, followerId);
  // 通知は常にフォローした人のページへ飛ばす(投稿がない人のページも、関係のある相手には開ける)。
  await insertOnce(admin, {
    userId: followeeId,
    type: "photo_follow",
    title: `${name}さんがあなたをフォローしました`,
    body: null,
    url: `/photo/u/${followerId}?by=${followerId}`,
  });
}
