"use server";

import { getPetViewer, petAdmin } from "@/lib/pet/db";
import { deletePetAccountForUser, type DeleteAccountResult } from "@/lib/pet/account";

/** ロカわんのアカウント削除(取り消せない)。確認の文字「削除」が一致したときだけ実行する。 */
export async function deletePetAccount(confirmText: string): Promise<DeleteAccountResult> {
  const viewer = await getPetViewer();
  if (!viewer) return { ok: false, error: "ログインが必要です" };
  if (confirmText.trim() !== "削除") return { ok: false, error: "確認の文字「削除」を入力してください" };
  return deletePetAccountForUser(petAdmin(), viewer.userId);
}
