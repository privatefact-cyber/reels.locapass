"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_THUMB_BYTES, uploadThumb } from "@/lib/embed-post/createEmbedPost";
import { createThreadsDraft, discardThreadsDraft, publishThreadsDraft, setThreadsDraftImage } from "@/lib/social/threadsPosts";

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

/** 下書きに写真を1枚付ける(JPEG/PNG/WebP、3MBまで)。投稿すると、画像つきの投稿になる。 */
export async function attachDraftImage(id: string, formData: FormData) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) throw new Error("写真を選んでください");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("写真は JPEG・PNG・WebP のどれかにしてください");
    if (file.size > MAX_THUMB_BYTES) throw new Error("写真が大きすぎます(上限3MB)");
    const url = await uploadThumb(createAdminClient(), await file.arrayBuffer(), file.type);
    if (!url) throw new Error("写真のアップロードに失敗しました");
    await setThreadsDraftImage(id, url);
  } catch (e) {
    message = e instanceof Error ? e.message : "写真を付けられませんでした";
  }
  if (message) back("error", message);
  back("ok", "写真を付けました");
}

export async function removeDraftImage(id: string) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await setThreadsDraftImage(id, null);
  } catch (e) {
    message = e instanceof Error ? e.message : "写真を外せませんでした";
  }
  if (message) back("error", message);
  back("ok", "写真を外しました");
}
