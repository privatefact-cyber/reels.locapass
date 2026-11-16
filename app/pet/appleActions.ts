"use server";

import { getPetViewer, petAdmin } from "@/lib/pet/db";
import { saveAppleRefreshToken } from "@/lib/pet/appleAuth";

/** 「Appleでサインイン」の直後に、アプリが受け取った認可コードを渡す(サーバーで更新用トークンに交換して保存) */
export async function savePetAppleAuthorization(authorizationCode: string): Promise<{ ok: boolean }> {
  const viewer = await getPetViewer();
  if (!viewer || typeof authorizationCode !== "string" || authorizationCode.length < 10 || authorizationCode.length > 2000) return { ok: false };
  return { ok: await saveAppleRefreshToken(petAdmin(), viewer.userId, authorizationCode) };
}
