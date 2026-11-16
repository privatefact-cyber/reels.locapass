import { petAdmin } from "./db";

/**
 * ユーザーのブロック(LOCAPASSと共通の locapass_user_blocks)。
 * ブロックした人の投稿(自慢ギャラリー・迷子のお知らせ・見つけた通報)は、ブロックした側の画面に出さない。
 * App Storeの審査ガイドライン1.2(ユーザーの投稿があるアプリは、迷惑な人をブロックできること)への対応。
 */
export async function getBlockedIds(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data } = await petAdmin().from("locapass_user_blocks").select("blocked_id").eq("blocker_id", userId);
  return new Set((data ?? []).map((r) => r.blocked_id as string));
}
