import { cookies } from "next/headers";

/** ロカわんのログイン画面を開いたときに付ける目印(1時間だけ有効)。新規会員の「登録元」の判定に使う。 */
export const SIGNUP_SRC_COOKIE = "lp_signup_src";

export type SignupSource = "pet" | "locapass";

/**
 * 新規会員の登録元。ロカわん(/pet)から来たなら 'pet'、それ以外は 'locapass'。
 * 戻り先が /pet で始まる、またはロカわんのログイン画面の目印があれば 'pet'。
 */
export async function resolveSignupSource(redirectTo?: string): Promise<SignupSource> {
  if (redirectTo && redirectTo.startsWith("/pet") && !redirectTo.startsWith("//")) return "pet";
  try {
    return (await cookies()).get(SIGNUP_SRC_COOKIE)?.value === "pet" ? "pet" : "locapass";
  } catch {
    return "locapass";
  }
}
