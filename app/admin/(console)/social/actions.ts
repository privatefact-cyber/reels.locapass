"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_THUMB_BYTES, uploadThumb } from "@/lib/embed-post/createEmbedPost";
import type { ThreadsAudience } from "@/lib/social/threadsTopics";
import { saveSocialSettings } from "@/lib/social/socialSettings";
import { checkSocialTokens, refreshSocialTokens } from "@/lib/social/tokens";
import { runSocialApiAudit } from "@/lib/social/apiAudit";
import { composeDraftWithScene, fanOutDraft, prepareCompose, saveReelDraft, type ComposeInput } from "@/lib/social/threadsPosts";
import { generateAiImage } from "@/lib/social/socialImages";
import { saveAutomationSetting, type AutomationMode, type AutomationSource } from "@/lib/social/socialAutomation";
import { createUploadedVideoDraft, createVideoDraft, createImageDraft, createManualThreadsPost, createThreadsDraft, discardThreadsDraft, publishThreadsDraft, scheduleThreadsPost, setThreadsDraftImage, updateThreadsPostBody } from "@/lib/social/threadsPosts";

function back(kind: "ok" | "error", message: string): never {
  revalidatePath("/admin/social");
  redirect(`/admin/social?${kind}=${encodeURIComponent(message.slice(0, 700))}`);
}

/** 投稿先ごとの自動運転設定。チェックを外すか緊急停止を入れると、次の巡回から止まる。 */
export async function saveAutomation(platform: "threads" | "instagram", account: "locapass" | "luxela", formData: FormData) {
  await requireRootAdmin();
  try {
    await saveAutomationSetting({
      platform, account,
      enabled: formData.get("enabled") === "on",
      mode: (formData.get("mode") === "auto" ? "auto" : "draft") as AutomationMode,
      source: (formData.get("source") === "research" ? "research" : formData.get("source") === "ai" ? "ai" : "shop") as AutomationSource,
      run_hour_jst: Number(formData.get("run_hour_jst") ?? 12),
      daily_max: Number(formData.get("daily_max") ?? 1),
      emergency_stop: formData.get("emergency_stop") === "on",
      last_run_on: null, last_error: null,
    });
  } catch (e) {
    back("error", e instanceof Error ? e.message : "自動運転の設定を保存できませんでした");
  }
  back("ok", `${platform === "instagram" ? "Instagram" : "Threads"} ${account === "luxela" ? "LUXELA" : "LOCAPASS"}の自動運転設定を保存しました`);
}

/** 下書きを1本、いま作る(AIに書かせる)。audience=読者(店舗向け/一般向け)。 */
export type DraftActionResult = { ok: boolean; message: string };

export async function createDraftNow(audience: ThreadsAudience, note = ""): Promise<DraftActionResult> {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    const result = await createThreadsDraft({ audience: audience === "shop" ? "shop" : "public", note });
    if (!result.ok) message = result.error;
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: "下書きを作りました。下の「下書き」に出ています" };
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

/** 画面から届いた、AIに見せる小さな画像(JPEG・600KBまで)を読む。無ければ null。 */
async function readImageHint(formData: FormData): Promise<{ mime: string; base64: string } | null> {
  const file = formData.get("imageHint");
  if (!(file instanceof File) || file.size === 0 || file.size > 600 * 1024 || file.type !== "image/jpeg") return null;
  return { mime: "image/jpeg", base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

const PLATFORM_LABEL = { threads: "Threads", instagram: "Instagram" } as const;

/** カードの投稿先チェック(Instagram / Threads)を読む。 */
function targetsFrom(formData: FormData): ("threads" | "instagram")[] {
  const out: ("threads" | "instagram")[] = [];
  if (formData.get("to_instagram") === "on") out.push("instagram");
  if (formData.get("to_threads") === "on") out.push("threads");
  if (!out.length) throw new Error("投稿先を1つ以上チェックしてください");
  return out;
}

/**
 * 下書きを、チェックした投稿先すべてに「今すぐ投稿」または「予約」する。
 * 先に全部の条件を確認し、だめなら何も公開しない。そのあと1つずつ出し、片方が失敗しても、もう片方は止めない。
 */
export async function postToChecked(id: string, formData: FormData) {
  await requireRootAdmin();
  const intent = formData.get("intent") === "schedule" ? "schedule" : "now";
  const lines: string[] = [];
  let allOk = true;
  try {
    const when = intent === "schedule" ? parseJstDateTime(formData.get("scheduled_at")) : null;
    if (intent === "schedule" && !when) throw new Error("予約する日時を入力してください");
    if (when && when.getTime() < Date.now() - 60_000) throw new Error("予約の日時が、過去になっています");
    const posts = await fanOutDraft(id, targetsFrom(formData));
    // 動画はMetaの処理待ちが長いので、投稿先ごとに順番ではなく同時に出す(待ち時間が足し算にならない)。
    const results = await Promise.all(posts.map(async (post) => {
      try {
        if (when) await scheduleThreadsPost(post.id, when);
        else await publishThreadsDraft(post.id);
        return `${PLATFORM_LABEL[post.platform]}: ${when ? "予約しました" : "投稿しました"}`;
      } catch (e) {
        allOk = false;
        return `${PLATFORM_LABEL[post.platform]}: 失敗(${e instanceof Error ? e.message : "失敗しました"})`;
      }
    }));
    lines.push(...results);
    if (when) lines.push(`(${when.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })})`);
  } catch (e) {
    back("error", e instanceof Error ? e.message : "投稿できませんでした(何も公開していません)");
  }
  back(allOk ? "ok" : "error", lines.join(" / "));
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
  // Instagramは JPEG しか受け付けないので、PNG・WebP も JPEG にそろえる(透明な部分は白、向きも直す。長い辺は2048pxまで)。
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().flatten({ background: "#ffffff" }).resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const bytes = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer;
  const url = await uploadThumb(createAdminClient(), bytes, "image/jpeg");
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
export async function createImageDraftNow(kind: "shop" | "ai", dest: string, audience: string, note = ""): Promise<DraftActionResult> {
  await requireRootAdmin();
  const [platform, account] = dest.split(":");
  let message: string | null = null;
  try {
    await createImageDraft(kind === "ai" ? "ai" : "shop", { platform: platform === "threads" ? "threads" : "instagram", account: account === "luxela" ? "luxela" : "locapass" }, audience === "shop" ? "shop" : audience === "auto" ? "auto" : "public", note);
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: "写真つきの下書きを作りました。下の「下書き」に出ています" };
}

/** AIへの指示とお手本を保存する(アカウントごと)。 */
export async function saveAiSettings(account: "locapass" | "luxela", formData: FormData) {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    await saveSocialSettings(account === "luxela" ? "luxela" : "locapass", { instructions: String(formData.get("instructions") ?? ""), examples: String(formData.get("examples") ?? "") });
  } catch (e) {
    message = e instanceof Error ? e.message : "保存に失敗しました";
  }
  if (message) back("error", message);
  back("ok", `${account === "luxela" ? "LUXELA" : "LOCAPASS"}のAIへの指示を保存しました。次に作る下書きから反映されます`);
}

/** トークンを今すぐ延長する(発行から24時間以内のものは、まだ延長できない)。 */
export async function refreshTokensNow() {
  await requireRootAdmin();
  let message: string | null = null;
  let summary = "";
  try {
    const results = await refreshSocialTokens({ force: true });
    summary = results.map((r) => `${r.label}: ${r.status === "refreshed" ? "延長しました" : r.status === "no_token" ? "未設定" : r.status === "failed" ? `失敗(${r.detail ?? ""})` : "不要"}`).join(" / ");
  } catch (e) {
    message = e instanceof Error ? e.message : "延長に失敗しました";
  }
  if (message) back("error", message);
  back("ok", summary.slice(0, 280));
}

/** トークンが使えるか確認する(投稿はしない)。 */
export async function checkTokensNow() {
  await requireRootAdmin();
  const results = await checkSocialTokens().catch(() => null);
  if (!results) back("error", "確認に失敗しました");
  const text = [...results].sort((a, b) => Number(a.ok) - Number(b.ok)).map((r) => `${r.ok ? "✓" : "✗"} ${r.label}: ${r.detail}`).join(" / ");
  back(results.every((r) => r.ok) ? "ok" : "error", text.slice(0, 690));
}

/** Meta APIの実機監査(読み取りだけ)。結果はDBに保存して、画面に表示する。 */
export async function runApiAuditNow() {
  await requireRootAdmin();
  let summary = "";
  try {
    const { rows } = await runSocialApiAudit();
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    summary = `監査しました: 使えた${count("ok")}件 / 使えない${count("error")}件 / 試せない${count("skipped")}件(下の表を見てください)`;
  } catch (e) {
    back("error", e instanceof Error ? e.message : "監査に失敗しました");
  }
  back("ok", summary);
}

/** 掲載店舗の動画(自前のサーバーにあるもの)で、リール/動画の下書きを作る。 */
export async function createVideoDraftNow(dest: string): Promise<DraftActionResult> {
  await requireRootAdmin();
  const [platform, account] = dest.split(":");
  let message: string | null = null;
  try {
    await createVideoDraft({ platform: platform === "threads" ? "threads" : "instagram", account: account === "luxela" ? "luxela" : "locapass" });
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: "動画の下書きを作りました。下の「下書き」に出ています(再生して確認できます)" };
}

/** アップロード済みの動画で、下書きを作る(動画本体はブラウザからR2へ直接送られている)。 */
export async function createUploadedVideoDraftNow(dest: string, videoUrl: string, text: string): Promise<DraftActionResult> {
  await requireRootAdmin();
  const [platform, account] = dest.split(":");
  let message: string | null = null;
  try {
    await createUploadedVideoDraft({ dest: { platform: platform === "threads" ? "threads" : "instagram", account: account === "luxela" ? "luxela" : "locapass" }, videoUrl, text });
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: "動画の下書きを作りました。下の「下書き」で再生して確認し、予約か投稿をしてください" };
}

/** 統合の「投稿をつくる」。写真の手動アップロードは、ここでR2/Storageへ送ってからURLにする(動画はブラウザから直接送られている)。 */
export async function composeDraftNow(formData: FormData): Promise<DraftActionResult> {
  await requireRootAdmin();
  let message: string | null = null;
  let scene: string | null = null;
  try {
    const [platform, account] = String(formData.get("dest") ?? "").split(":");
    const form = String(formData.get("form") ?? "");
    const textMode = String(formData.get("textMode") ?? "auto");
    const mediaKind = String(formData.get("mediaKind") ?? "none");
    let media: ComposeInput["media"];
    if (mediaKind === "upload-photo-url") {
      // ブラウザで作ったチラシ画像(R2の social/ 以下のJPEG)
      const { R2_PUBLIC_BASE_URL } = await import("@/lib/storage/r2");
      const url = String(formData.get("photoUrl") ?? "");
      if (!url.startsWith(`${R2_PUBLIC_BASE_URL}/social/`) || !url.endsWith(".jpg")) throw new Error("画像のURLが正しくありません");
      const head = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (!head?.ok || !/^image\/jpeg/i.test(head.headers.get("content-type") ?? "")) throw new Error("アップロードした画像を確認できませんでした");
      media = { kind: "upload-photo", url };
    } else if (mediaKind === "upload-photo") {
      const url = await uploadOptionalImage(formData.get("photo"));
      if (!url) throw new Error("写真を選んでください");
      media = { kind: "upload-photo", url };
    } else if (mediaKind === "upload-video") {
      media = { kind: "upload-video", url: String(formData.get("videoUrl") ?? "") };
      if (!media.url) throw new Error("動画を選んでください");
    } else if (mediaKind === "shop-photo" || mediaKind === "shop-video" || mediaKind === "ai-image") media = { kind: mediaKind };
    else media = { kind: "none" };
    const audienceRaw = String(formData.get("audience") ?? "public");
    const input: ComposeInput = {
      dest: { platform: platform === "threads" ? "threads" : "instagram", account: account === "luxela" ? "luxela" : "locapass" },
      form: form === "reel" ? "reel" : form === "post" ? "post" : "feed",
      text: textMode === "manual" ? { mode: "manual", body: String(formData.get("body") ?? "") } : { mode: "auto", audience: audienceRaw === "shop" ? "shop" : audienceRaw === "auto" ? "auto" : "public", note: String(formData.get("note") ?? "").slice(0, 300) },
      media,
      style: String(formData.get("style") ?? "photo") === "illustration" ? "illustration" : String(formData.get("style") ?? "photo") === "flyer" ? "flyer" : "photo",
      headline: String(formData.get("headline") ?? "").slice(0, 20),
      imageHint: await readImageHint(formData),
    };
    if (media.kind === "upload-video") {
      // 動画は、実際のファイルで形式・大きさを確認する(R2の social/ 以下だけ)。
      const { R2_PUBLIC_BASE_URL } = await import("@/lib/storage/r2");
      if (!media.url.startsWith(`${R2_PUBLIC_BASE_URL}/social/`)) throw new Error("動画のURLが正しくありません");
      const head = await fetch(media.url, { method: "HEAD" }).catch(() => null);
      if (!head?.ok || !/^video\/(mp4|quicktime)/i.test(head.headers.get("content-type") ?? "")) throw new Error("アップロードした動画を確認できませんでした");
    }
    scene = (await composeDraftWithScene(input)).imageScene;
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: `下書きを作りました。下の「下書き」で確認して、投稿か予約をしてください(まだ公開されていません)${scene === null ? "" : scene ? `\n画像の場面: ${scene}` : "\n画像の場面: 文章から決められなかったため、一般的な雰囲気の絵になっています(もう一度作ると直ることがあります)"}` };
}

/** チラシの背景(文字なしのイラスト)をAIで作り、ブラウザで文字を重ねられるよう、画像データを返す。 */
export async function generateFlyerBaseNow(account: string, theme: string): Promise<{ ok: boolean; message: string; dataUrl?: string }> {
  await requireRootAdmin();
  try {
    const acc = account === "luxela" ? "luxela" : "locapass";
    const url = await generateAiImage(theme.slice(0, 40) || "街のお店", acc, { style: "flyer" });
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error("画像を取得できませんでした");
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { ok: true, message: "", dataUrl: `data:image/jpeg;base64,${b64}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "チラシの背景を作れませんでした" };
  }
}

export type ReelPrepared = { ok: boolean; message: string; dataUrl?: string; body?: string; topicId?: string; source?: "ai" | "manual" };

/** 画像から作るリールの準備: 文章と画像を用意して、ブラウザで動画にするため、画像データを返す(まだ保存しない)。 */
export async function prepareReelNow(formData: FormData): Promise<ReelPrepared> {
  await requireRootAdmin();
  try {
    const [, account] = String(formData.get("dest") ?? "").split(":");
    const mediaKind = String(formData.get("mediaKind") ?? "");
    const textMode = String(formData.get("textMode") ?? "auto");
    const audienceRaw = String(formData.get("audience") ?? "public");
    let media: ComposeInput["media"];
    if (mediaKind === "reel-upload-photo") {
      const url = await uploadOptionalImage(formData.get("photo"));
      if (!url) throw new Error("写真を選んでください");
      media = { kind: "reel-upload-photo", url };
    } else if (mediaKind === "reel-ai" || mediaKind === "reel-shop-photo") media = { kind: mediaKind };
    else throw new Error("素材を選んでください");
    const style = String(formData.get("style") ?? "photo") === "illustration" ? "illustration" : "photo";
    const input: ComposeInput = {
      dest: { platform: "instagram", account: account === "luxela" ? "luxela" : "locapass" },
      form: "reel",
      text: textMode === "manual" ? { mode: "manual", body: String(formData.get("body") ?? "") } : { mode: "auto", audience: audienceRaw === "shop" ? "shop" : audienceRaw === "auto" ? "auto" : "public", note: String(formData.get("note") ?? "").slice(0, 300) },
      media,
      style,
      imageHint: await readImageHint(formData),
    };
    const prepared = await prepareCompose(input);
    if (!prepared.imageUrl) throw new Error("画像を用意できませんでした");
    const res = await fetch(prepared.imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error("画像を取得できませんでした");
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { ok: true, message: "", dataUrl: `data:image/jpeg;base64,${b64}`, body: prepared.body, topicId: prepared.topicId, source: prepared.source };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "リールの準備に失敗しました" };
  }
}

/** ブラウザで作った動画を、リールの下書きとして保存する。 */
export async function saveReelDraftNow(input: { dest: string; videoUrl: string; body: string; topicId: string; source: "ai" | "manual" }): Promise<DraftActionResult> {
  await requireRootAdmin();
  let message: string | null = null;
  try {
    const [, account] = input.dest.split(":");
    await saveReelDraft({ dest: { platform: "instagram", account: account === "luxela" ? "luxela" : "locapass" }, videoUrl: input.videoUrl, body: input.body, topicId: input.topicId.slice(0, 80), source: input.source === "ai" ? "ai" : "manual" });
  } catch (e) {
    message = e instanceof Error ? e.message : "下書きを作れませんでした";
  }
  revalidatePath("/admin/social");
  return message ? { ok: false, message } : { ok: true, message: "リールの下書きを作りました。下の「下書き」で再生して確認してください(まだ公開されていません)" };
}
