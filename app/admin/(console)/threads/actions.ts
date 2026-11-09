"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createThreadsDraft, discardThreadsDraft, publishThreadsDraft } from "@/lib/social/threadsPosts";

function back(kind: "ok" | "error", message: string): never {
  revalidatePath("/admin/threads");
  redirect(`/admin/threads?${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

/** 下書きを1本、いま作る(AIに書かせる)。 */
export async function createDraftNow() {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    const result = await createThreadsDraft();
    if (!result.ok) message = result.error;
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  if (message) back("error", message);
  back("ok", "下書きを作りました。内容を確認してください");
}

/** 下書きをThreadsに投稿する(loca.pass に公開される)。 */
export async function publishDraft(id: string) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await publishThreadsDraft(id);
  } catch (e) {
    message = e instanceof Error ? e.message : "投稿に失敗しました";
  }
  if (message) back("error", message);
  back("ok", "Threadsに投稿しました");
}

export async function discardDraft(id: string) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await discardThreadsDraft(id);
  } catch (e) {
    message = e instanceof Error ? e.message : "破棄に失敗しました";
  }
  if (message) back("error", message);
  back("ok", "下書きを破棄しました");
}
