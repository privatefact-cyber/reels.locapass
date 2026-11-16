"use server";

import { getPetViewer, petAdmin } from "@/lib/pet/db";

/** AIへのデータ送信への同意を、保存する(granted=true)/取り消す(false)。 */
export async function setPetAiConsent(granted: boolean): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  const { error } = await petAdmin()
    .from("locapass_pet_owner_settings")
    .upsert({ user_id: viewer.userId, ai_consent_at: granted ? new Date().toISOString() : null }, { onConflict: "user_id" });
  if (error) {
    console.error("[pet-ai-consent] save_failed", error.message);
    return { ok: false, error: "保存できませんでした。もう一度お試しください" };
  }
  return { ok: true };
}
