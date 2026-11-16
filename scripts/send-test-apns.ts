/**
 * ロカわんのアプリ(登録済みの端末)に、テスト通知を1件送る。APNsの鍵(.env.local)が必要。
 * 使い方: set -a; . ./.env.local; set +a; npx tsx scripts/send-test-apns.ts メールアドレス
 */
import { createClient } from "@supabase/supabase-js";
import { apnsConfigured, sendApnsToUser } from "../lib/push/apns";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("メールアドレスを指定してください");
  if (!apnsConfigured()) throw new Error("APNSの鍵(APNS_KEY_P8 / APNS_KEY_ID)が設定されていません");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: userId, error } = await admin.rpc("locapass_get_user_id_by_email", { p_email: email });
  if (error || !userId) throw new Error("ユーザーが見つかりません");
  const { count } = await admin.from("locapass_apns_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId);
  console.log(`登録済みの端末: ${count ?? 0}台`);
  await sendApnsToUser(userId as string, { title: "ロカわんのテスト通知", body: "この通知が届けば、プッシュ通知は動いています 🐾", url: "/pet/settings" });
  const { count: after } = await admin.from("locapass_apns_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId);
  console.log(`送信しました。送信後の登録端末: ${after ?? 0}台(減っていたら、使えない端末を削除しています)`);
}
main().catch((e) => {
  console.error("失敗:", e.message);
  process.exit(1);
});
