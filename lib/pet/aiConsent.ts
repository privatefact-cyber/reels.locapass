import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ロカわんで、外部のAI(Gemini)にデータを送ることへの同意。
 * 同意した日時を locapass_pet_owner_settings.ai_consent_at に持つ(NULL = 未同意)。
 * AIに送る処理は、必ずこの同意を確かめてから行う(App Storeの審査ガイドライン5.1.2)。
 */
export const AI_CONSENT_REQUIRED = "AI_CONSENT_REQUIRED";

export async function hasPetAiConsent(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("locapass_pet_owner_settings").select("ai_consent_at").eq("user_id", userId).maybeSingle();
  return Boolean(data?.ai_consent_at);
}
