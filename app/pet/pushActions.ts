"use server";

import { getPetViewer, petAdmin } from "@/lib/pet/db";

type Result = { ok: true } | { ok: false; error: string };

/** iPhoneアプリの通知トークンを、ログイン中の人にひもづけて保存する(同じトークンは付け替える) */
export async function savePetApnsToken(token: string): Promise<Result> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  // APNsのトークンは16進の文字列(通常64文字)。それ以外は受け付けない
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) return { ok: false, error: "トークンの形式が正しくありません" };
  const { error } = await petAdmin()
    .from("locapass_apns_tokens")
    .upsert({ user_id: viewer.userId, token: token.toLowerCase(), last_seen_at: new Date().toISOString() }, { onConflict: "token" });
  if (error) {
    console.error("[pet-apns] save_failed", error.message);
    return { ok: false, error: "保存できませんでした" };
  }
  return { ok: true };
}

/** 通知をオフにした端末のトークンを消す(本人のものだけ) */
export async function removePetApnsToken(token: string): Promise<Result> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  await petAdmin().from("locapass_apns_tokens").delete().eq("user_id", viewer.userId).eq("token", token.toLowerCase());
  return { ok: true };
}
