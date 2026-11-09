"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_THUMB_BYTES, uploadThumb } from "@/lib/embed-post/createEmbedPost";
import type { ThreadsAudience } from "@/lib/social/threadsTopics";
import { createImageDraft, createManualThreadsPost, createThreadsDraft, discardThreadsDraft, publishThreadsDraft, scheduleThreadsPost, setThreadsDraftImage, updateThreadsPostBody } from "@/lib/social/threadsPosts";

function back(kind: "ok" | "error", message: string): never {
  revalidatePath("/admin/threads");
  redirect(`/admin/threads?${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

/** 下書きを1本、いま作る(AIに書かせる)。audience=読者(店舗向け/一般向け)。 */
export async function createDraftNow(audience: ThreadsAudience) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    const result = await createThreadsDraft({ audience: audience === "shop" ? "shop" : "public" });
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
  back("ok", "投稿しました(反映まで数分かかることがあります)");
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

/** 画面の日時入力(datetime-local、日本時間)を、Dateにする。空ならnull。 */
function parseJstDateTime(value: FormDataEntryValue | null): Date | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  const date = new Date(`${v}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error("日時の形式が正しくありません");
  return date;
}

/** 写真(任意)をアップロードして、公開URLを返す。無ければnull。 */
async function uploadOptionalImage(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("写真は JPEG・PNG・WebP のどれかにしてください");
  if (file.size > MAX_THUMB_BYTES) throw new Error("写真が大きすぎます(上限3MB)");
  const url = await uploadThumb(createAdminClient(), await file.arrayBuffer(), file.type);
  if (!url) throw new Error("写真のアップロードに失敗しました");
  return url;
}

/**
 * 自分で書いた文章を投稿する。mode: "schedule"=日時を決めて予約 / "now"=今すぐ投稿 / "draft"=下書きに保存。
 */
export async function createManualPost(formData: FormData) {
  await requireRootAdmin();
  const mode = String(formData.get("mode") ?? "draft");
  let message: string | null = null;
  let done = "保存しました";
  try {
    const scheduledAt = mode === "schedule" ? parseJstDateTime(formData.get("scheduled_at")) : null;
    if (mode === "schedule" && !scheduledAt) throw new Error("予約する日時を入力してください");
    const imageUrl = await uploadOptionalImage(formData.get("image"));
    const [platform, account] = String(formData.get("dest") ?? "threads:locapass").split(":");
    const dest = { platform: platform === "instagram" ? "instagram" : "threads", account: account === "luxela" ? "luxela" : "locapass" } as const;
    const id = await createManualThreadsPost({ text: String(formData.get("body") ?? ""), imageUrl, scheduledAt, dest });
    if (mode === "now") {
      await publishThreadsDraft(id);
      done = "投稿しました(反映まで数分かかることがあります)";
    } else if (scheduledAt) {
      done = `予約しました(${scheduledAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })})`;
    }
  } catch (e) {
    message = e instanceof Error ? e.message : "保存に失敗しました";
  }
  if (message) back("error", message);
  back("ok", done);
}

/** 下書き・予約中の文章を直す。 */
export async function editPostBody(id: string, formData: FormData) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await updateThreadsPostBody(id, String(formData.get("body") ?? ""));
  } catch (e) {
    message = e instanceof Error ? e.message : "保存に失敗しました";
  }
  if (message) back("error", message);
  back("ok", "文章を保存しました");
}

/** 下書きを、日時を決めて予約する(予約中のものは、日時を変える)。 */
export async function schedulePost(id: string, formData: FormData) {
  await requireRootAdmin();
  let message: string | null = null;
  let when: Date | null = null;
  try {
    when = parseJstDateTime(formData.get("scheduled_at"));
    if (!when) throw new Error("予約する日時を入力してください");
    await scheduleThreadsPost(id, when);
  } catch (e) {
    message = e instanceof Error ? e.message : "予約に失敗しました";
  }
  if (message) back("error", message);
  back("ok", `予約しました(${when!.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })})`);
}

/** 予約を取り消して、下書きに戻す。 */
export async function unschedulePost(id: string) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await scheduleThreadsPost(id, null);
  } catch (e) {
    message = e instanceof Error ? e.message : "取り消せませんでした";
  }
  if (message) back("error", message);
  back("ok", "予約を取り消しました(下書きに戻しました)");
}

/** 写真つきの下書きを自動で作る(店舗の写真 / AIの画像)。 */
export async function createImageDraftNow(kind: "shop" | "ai", dest: string) {
  await requireRootAdmin();
  const [platform, account] = dest.split(":");
  let message: string | null = null;
  try {
    await createImageDraft(kind === "ai" ? "ai" : "shop", { platform: platform === "threads" ? "threads" : "instagram", account: account === "luxela" ? "luxela" : "locapass" });
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  if (message) back("error", message);
  back("ok", "写真つきの下書きを作りました。内容を確認してください");
}
