import { createAdminClient } from "@/lib/supabase/admin";

export type SocialAccountKey = "locapass" | "luxela";
export type SocialSettings = { instructions: string; examples: string; updated_at: string | null };

export const MAX_INSTRUCTIONS = 1500;
export const MAX_EXAMPLES = 3000;
export const MAX_NOTE = 300;

const db = () => createAdminClient() as any;

/** 管理画面で書いた、AIへの指示とお手本(アカウントごと)。読めなければ空として扱う(投稿は止めない)。 */
export async function getSocialSettings(account: SocialAccountKey): Promise<SocialSettings> {
  const { data } = await db().from("locapass_social_settings").select("instructions, examples, updated_at").eq("account", account).maybeSingle();
  return { instructions: String(data?.instructions ?? ""), examples: String(data?.examples ?? ""), updated_at: data?.updated_at ?? null };
}

export async function saveSocialSettings(account: SocialAccountKey, input: { instructions: string; examples: string }): Promise<void> {
  const instructions = input.instructions.trim();
  const examples = input.examples.trim();
  if (instructions.length > MAX_INSTRUCTIONS) throw new Error(`指示は${MAX_INSTRUCTIONS}文字までです(いま${instructions.length}文字)`);
  if (examples.length > MAX_EXAMPLES) throw new Error(`お手本は${MAX_EXAMPLES}文字までです(いま${examples.length}文字)`);
  const { data, error } = await db().from("locapass_social_settings").upsert({ account, instructions, examples, updated_at: new Date().toISOString() }, { onConflict: "account" }).select("account");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("保存できませんでした(0件)");
}

/** お手本の欄を、1本ずつに分ける(「---」だけの行で区切る)。 */
export function splitExamples(examples: string): string[] {
  return examples.split(/^\s*-{3,}\s*$/m).map((e) => e.trim()).filter(Boolean);
}
