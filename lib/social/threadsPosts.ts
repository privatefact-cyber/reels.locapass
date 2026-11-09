import { createAdminClient } from "@/lib/supabase/admin";
import { createThreadsVideoContainer, publishThreadsContainer, publishThreadsImagePost, publishThreadsTextPost, threadsContainerState } from "@/lib/social/threads";
import { createInstagramReelContainer, instagramContainerState, publishInstagramContainer, publishInstagramImagePost, type SocialAccount } from "@/lib/social/instagram";
import { pickShopVideo } from "@/lib/social/socialVideos";
import { resolveSocialToken } from "@/lib/social/tokens";
import { THREADS_TOPICS, LUXELA_TOPICS, topicsFor, type ThreadsAudience, type ThreadsTopic } from "@/lib/social/threadsTopics";
import { generateAiImage, pickShopPhoto } from "@/lib/social/socialImages";
import { THREADS_MAX_CHARS, validateThreadsText, writeThreadsPost } from "@/lib/social/threadsWriter";

/**
 * LOCAPASS公式Threadsの投稿の管理。
 * - 自分で書いた文章(manual)を、日時を決めて予約投稿する。
 * - AIが書いた文章(ai)も、同じ流れ(下書き → 予約 or 今すぐ投稿)に乗せる。
 * THREADS_TEXT_MODE(AIの下書きの扱い): "off"=AIは何もしない / "draft"(既定)=毎日1本、下書きを作るだけ / "auto"=AIが書いて確認なしで自動投稿。
 * 予約した投稿は、モードに関係なく、時間になると自動で投稿される。
 */
export type TextMode = "off" | "draft" | "auto";
export function textModeFromEnv(): TextMode {
  const v = (process.env.THREADS_TEXT_MODE ?? "draft").trim().toLowerCase();
  return v === "off" || v === "auto" ? v : "draft";
}

const MAX_PENDING_DRAFTS = 3;
/** AIの下書きを作る時刻(日本時間)。cronは30分おきに動くが、AIが書くのは1日1回、この時刻の枠だけ。 */
const AI_HOUR_JST = 12;
const db = () => createAdminClient() as any;

export type PostRow = {
  id: string;
  topic: string;
  body: string;
  image_url: string | null;
  video_url: string | null;
  container_id: string | null;
  source: "ai" | "manual";
  platform: "threads" | "instagram";
  account: SocialAccount;
  status: "draft" | "scheduled" | "processing" | "posted" | "failed" | "discarded";
  error: string | null;
  created_at: string;
  posted_at: string | null;
  scheduled_at: string | null;
};
const COLUMNS = "id, topic, body, image_url, video_url, container_id, source, platform, account, status, error, created_at, posted_at, scheduled_at";

/** 直近のAIの投稿(重複を避けるための材料)。破棄したものは除く。 */
async function recentRows(limit = 40): Promise<PostRow[]> {
  const { data, error } = await db().from("locapass_threads_posts").select(COLUMNS).neq("status", "discarded").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`直近の投稿の取得に失敗しました: ${error.message}`);
  return (data ?? []) as PostRow[];
}

/** 直近の投稿の読者(店舗向け/一般向け)。テーマIDから分かる。 */
function audienceOf(topicId: string): ThreadsAudience | null {
  return [...THREADS_TOPICS, ...LUXELA_TOPICS].find((t) => t.id === topicId)?.audience ?? null;
}

/** 読者を指定しなければ、直近の投稿と逆の読者(店舗向けと一般向けを交互)にする。最近使っていないテーマを選ぶ。 */
function pickTopic(rows: PostRow[], audience?: ThreadsAudience, account: SocialAccount = "locapass"): ThreadsTopic {
  const last = rows.filter((r) => r.source === "ai").map((r) => audienceOf(r.topic)).find((a): a is ThreadsAudience => a !== null);
  const wanted: ThreadsAudience = audience ?? (last === "public" ? "shop" : "public");
  const pool = topicsFor(account).filter((t) => t.audience === wanted);
  const lastUsed = new Map<string, number>();
  rows.forEach((r, index) => { if (!lastUsed.has(r.topic)) lastUsed.set(r.topic, index); });
  const unused = pool.filter((t) => !lastUsed.has(t.id));
  if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)];
  return [...pool].sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0))[0];
}

export type DraftResult = { ok: true; id: string; topic: string; text: string } | { ok: false; error: string };

/** AIの下書きを1本作って保存する。dry=true なら、保存せずに文章だけ返す。 */
export async function createThreadsDraft(options?: { dry?: boolean; audience?: ThreadsAudience; note?: string }): Promise<DraftResult> {
  const rows = await recentRows();
  const topic = pickTopic(rows, options?.audience);
  const written = await writeThreadsPost(topic, rows.map((r) => r.body), "locapass", options?.note ?? "");
  if (!written.ok) {
    // 不採用になった文章と理由を、失敗として記録する(管理画面の「これまでの投稿」で見える)。
    if (!options?.dry) await db().from("locapass_threads_posts").insert({ topic: topic.id, body: written.lastText ?? "(文章を作れませんでした)", status: "failed", error: written.error, source: "ai" });
    return { ok: false, error: written.error };
  }
  if (options?.dry) return { ok: true, id: "dry-run", topic: topic.id, text: written.text };
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: topic.id, body: written.text, status: "draft", source: "ai" }).select("id").single();
  if (error || !data) return { ok: false, error: `下書きの保存に失敗しました: ${error?.message ?? "0件"}` };
  return { ok: true, id: data.id as string, topic: topic.id, text: written.text };
}

export type Destination = { platform: "threads" | "instagram"; account: SocialAccount };
const maxChars = (platform: string) => (platform === "instagram" ? 2200 : 500);

function checkManualText(text: string, platform: string = "threads"): string {
  const t = text.trim();
  if (t.length < 1) throw new Error("文章を入力してください");
  if (t.length > maxChars(platform)) throw new Error(`${platform === "instagram" ? "Instagram" : "Threads"}の上限(${maxChars(platform)}文字)を超えています(${t.length}文字)`);
  return t;
}

/** 自分で書いた文章を保存する。scheduledAt があれば予約、無ければ下書き。 */
export async function createManualThreadsPost(input: { text: string; imageUrl: string | null; scheduledAt: Date | null; dest?: Destination }): Promise<string> {
  const dest = input.dest ?? { platform: "threads", account: "locapass" };
  const body = checkManualText(input.text, dest.platform);
  if (dest.platform === "instagram" && !input.imageUrl && input.scheduledAt) throw new Error("Instagramは写真が必要です。写真を付けてください");
  if (input.scheduledAt && input.scheduledAt.getTime() < Date.now() - 60_000) throw new Error("予約の日時が、過去になっています");
  const { data, error } = await db().from("locapass_threads_posts").insert({
    topic: "manual", body, image_url: input.imageUrl, source: "manual", platform: dest.platform, account: dest.account,
    status: input.scheduledAt ? "scheduled" : "draft",
    scheduled_at: input.scheduledAt ? input.scheduledAt.toISOString() : null,
  }).select("id").single();
  if (error || !data) throw new Error(`保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}

/**
 * 写真つきの下書きを自動で作る。kind="shop"=掲載店舗の写真+店名・リンク・(あれば)お店のInstagramのタグ付け / kind="ai"=AIの画像+AIの文章(一般向け)。
 * 投稿先は dest。Instagramは写真必須なので、どちらも写真つきで作る。
 */
export async function createImageDraft(kind: "shop" | "ai", dest: Destination, audience: ThreadsAudience | "auto" = "public", note = ""): Promise<string> {
  const admin = db();
  const rows = (await recentRows()).filter((r) => r.account === dest.account);
  let body: string;
  let imageUrl: string;
  let topic: string;
  if (kind === "shop") {
    const photo = await pickShopPhoto(rows.filter((r) => r.topic.startsWith("shop:")).map((r) => r.topic.slice(5)), dest.account);
    const site = dest.account === "luxela" ? { url: "https://luxela.jp", name: "LUXELA" } : { url: "https://locapass.net", name: "LOCAPASS" };
    const link = photo.shopCode ? `${site.url}/s/${photo.shopCode}` : site.url;
    body = [`📍 ${photo.shopName}`, photo.description, `${dest.account === "luxela" ? "出勤・詳細" : "動画・詳細"}は${site.name}で\n${link}`, photo.instagramHandle ? `@${photo.instagramHandle}` : ""].filter(Boolean).join("\n\n");
    imageUrl = photo.imageUrl;
    topic = `shop:${photo.recentlyUsedKey}`;
  } else {
    const t = pickTopic(rows, audience === "auto" ? undefined : audience, dest.account);
    const written = await writeThreadsPost(t, rows.map((r) => r.body), dest.account, note);
    if (!written.ok) throw new Error(written.error);
    body = written.text;
    imageUrl = await generateAiImage(t.title, dest.account);
    topic = t.id;
  }
  const { data, error } = await admin.from("locapass_threads_posts").insert({ topic, body, image_url: imageUrl, source: kind === "shop" ? "manual" : "ai", status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
  if (error || !data) throw new Error(`下書きの保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}

/** 下書きの文章を直す(下書き・予約中のものだけ)。 */
export async function updateThreadsPostBody(id: string, text: string): Promise<void> {
  const body = checkManualText(text);
  const { data, error } = await db().from("locapass_threads_posts").update({ body }).eq("id", id).in("status", ["draft", "scheduled"]).select("id");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("直せませんでした(対象が見つからないか、処理済みです)");
}

/** 下書きを、日時を決めて予約する(when=null なら予約を取り消して下書きに戻す)。 */
export async function scheduleThreadsPost(id: string, when: Date | null): Promise<void> {
  if (when && when.getTime() < Date.now() - 60_000) throw new Error("予約の日時が、過去になっています");
  const patch = when ? { status: "scheduled", scheduled_at: when.toISOString() } : { status: "draft", scheduled_at: null };
  const { data, error } = await db().from("locapass_threads_posts").update(patch).eq("id", id).in("status", ["draft", "scheduled"]).select("id");
  if (error) throw new Error(`予約に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("予約できませんでした(対象が見つからないか、処理済みです)");
}

/** 下書き・予約中の投稿を、Threadsに投稿する。失敗しても、理由を記録に残す(同じ文章を勝手に再投稿しない)。 */
export async function publishThreadsDraft(id: string): Promise<void> {
  const admin = db();
  const { data: row, error } = await admin.from("locapass_threads_posts").select("id, body, image_url, video_url, source, platform, account, status").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "下書きが見つかりません");
  if (row.status !== "draft" && row.status !== "scheduled") throw new Error("この投稿は、すでに処理済みです");
  const isInstagram = row.platform === "instagram";
  const threadsToken = isInstagram ? null : await resolveSocialToken("threads", row.account);
  const config = threadsToken ? { userId: process.env.THREADS_USER_ID?.trim() || null, accessToken: threadsToken } : null;
  const igToken = isInstagram ? await resolveSocialToken("instagram", row.account) : null;
  if (isInstagram && !igToken) throw new Error(`Instagram(${row.account})のトークンが未設定です`);
  if (isInstagram && !row.image_url && !row.video_url) throw new Error("Instagramは写真か動画が必要です。付けてください");
  if (!isInstagram && !config) throw new Error(`Threads(${row.account})のトークンが未設定です`);
  // AIが書いた文章は、投稿の直前にもう一度、安全チェックをする。自分で書いた文章は、文字数だけ確認する。
  if (row.source === "ai") {
    const problem = validateThreadsText(row.body, [], row.account === "luxela" ? "luxela" : "locapass");
    if (problem) throw new Error(`投稿できない文章です: ${problem}`);
  } else if (row.body.length > (isInstagram ? 2200 : THREADS_MAX_CHARS + 20)) {
    throw new Error("文章が長すぎます");
  }
  if (row.video_url) return publishVideoDraft({ id, body: row.body, videoUrl: row.video_url, isInstagram, igToken, config, status: row.status });
  // 二重に投稿しないよう、先に「投稿中」の印として、同じ状態のときだけ予約を外す(同時に動いても、1回しか通らない)。
  const { data: claimed } = await admin.from("locapass_threads_posts").update({ scheduled_at: null }).eq("id", id).eq("status", row.status).select("id");
  if (!claimed?.length) throw new Error("この投稿は、いま別の処理で投稿中です");
  try {
    // 写真が付いていれば、画像つきの投稿にする(Threadsは、公開されたURLの画像を取り込む)。
    const externalId = isInstagram
      ? await publishInstagramImagePost(igToken!, { caption: row.body, imageUrl: row.image_url! })
      : row.image_url
        ? await publishThreadsImagePost(config!, { text: row.body, imageUrl: row.image_url })
        : await publishThreadsTextPost(config!, { text: row.body });
    const { data: updated, error: updateError } = await admin.from("locapass_threads_posts").update({ status: "posted", external_id: externalId, posted_at: new Date().toISOString(), error: null }).eq("id", id).select("id");
    if (updateError || !updated?.length) throw new Error("投稿はできましたが、記録の更新に失敗しました。Threadsで二重に投稿しないよう確認してください");
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "投稿に失敗しました";
    await admin.from("locapass_threads_posts").update({ status: "failed", error: message }).eq("id", id);
    throw new Error(message);
  }
}

/** 下書きに写真を1枚付ける(url=null なら外す)。 */
export async function setThreadsDraftImage(id: string, url: string | null): Promise<void> {
  const { data, error } = await db().from("locapass_threads_posts").update({ image_url: url }).eq("id", id).in("status", ["draft", "scheduled"]).select("id");
  if (error) throw new Error(`写真の保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("写真を付けられませんでした(対象が見つからないか、処理済みです)");
}

export async function discardThreadsDraft(id: string): Promise<void> {
  const { data, error } = await db().from("locapass_threads_posts").update({ status: "discarded", scheduled_at: null }).eq("id", id).in("status", ["draft", "scheduled"]).select("id");
  if (error) throw new Error(`破棄に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("破棄できませんでした(対象が見つからないか、処理済みです)");
}

/** 日本時間の「いま何時か」「今日の0時はいつか」。 */
function jstNow() {
  const shifted = new Date(Date.now() + 9 * 3_600_000);
  const startOfDayUtc = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 9 * 3_600_000);
  return { hour: shifted.getUTCHours(), startOfDay: startOfDayUtc };
}

/**
 * cronから呼ぶ(30分おき)。
 * 1) 予約の時間になった投稿を、1回に1本ずつ投稿する(モードに関係なく)。
 * 2) 毎日12時台に1回だけ、モードに応じてAIの下書きを作る/自動投稿する。
 * dry=true なら、AIの文章を作るだけで何も保存・投稿しない。
 */
export async function runThreadsTextCron(options: { dry: boolean }) {
  const mode = textModeFromEnv();
  if (options.dry) return { mode, dry: true, result: await createThreadsDraft({ dry: true }) };

  const admin = db();
  const out: Record<string, unknown> = { mode };

  // 0) 動画の処理が終わったものを公開する
  try { const finalized = await finalizeProcessingVideos(); if (finalized.length) out.finalized = finalized; } catch (e) { out.finalizeError = e instanceof Error ? e.message : "動画の確認に失敗"; }

  // 1) 予約の時間になったもの
  const { data: due } = await admin.from("locapass_threads_posts").select("id").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(1);
  if (due?.length) {
    try {
      await publishThreadsDraft(due[0].id);
      out.scheduledPosted = due[0].id;
    } catch (e) {
      out.scheduledError = e instanceof Error ? e.message : "予約の投稿に失敗しました";
    }
  }

  // 2) AIの下書き/自動投稿(1日1回)
  const { hour, startOfDay } = jstNow();
  if (mode === "off" || hour !== AI_HOUR_JST) return out;
  const { data: todayAi } = await admin.from("locapass_threads_posts").select("id").eq("source", "ai").gte("created_at", startOfDay.toISOString()).limit(1);
  if (todayAi?.length) return out;

  if (mode === "draft") {
    const { data: pending } = await admin.from("locapass_threads_posts").select("id").eq("status", "draft").eq("source", "ai");
    if ((pending?.length ?? 0) >= MAX_PENDING_DRAFTS) return { ...out, skipped: "drafts-pending" };
    return { ...out, result: await createThreadsDraft() };
  }

  // auto: 24時間の投稿数の上限を守る。
  const dailyMax = Number(process.env.THREADS_TEXT_DAILY_MAX ?? 1) || 1;
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: posted } = await admin.from("locapass_threads_posts").select("id").eq("status", "posted").eq("source", "ai").gte("posted_at", since);
  if ((posted?.length ?? 0) >= dailyMax) return { ...out, skipped: "daily-cap" };
  const draft = await createThreadsDraft();
  if (!draft.ok) return { ...out, result: draft };
  await publishThreadsDraft(draft.id);
  return { ...out, result: draft, published: true };
}

export async function listThreadsPosts(): Promise<PostRow[]> {
  const { data, error } = await db().from("locapass_threads_posts").select(COLUMNS).order("created_at", { ascending: false }).limit(60);
  if (error) throw new Error(`一覧の取得に失敗しました: ${error.message}`);
  return (data ?? []) as PostRow[];
}


const VIDEO_WAIT_MS = 75_000;
const VIDEO_GIVE_UP_MS = 40 * 60_000;
type VideoCtx = { id: string; body: string; videoUrl: string; isInstagram: boolean; igToken: string | null; config: { userId: string | null; accessToken: string } | null; status: string };

async function stateOf(ctx: Pick<VideoCtx, "isInstagram" | "igToken" | "config">, containerId: string) {
  return ctx.isInstagram ? instagramContainerState(ctx.igToken!, containerId) : threadsContainerState(ctx.config!, containerId);
}
async function publishContainer(ctx: Pick<VideoCtx, "isInstagram" | "igToken" | "config">, containerId: string): Promise<string> {
  return ctx.isInstagram ? publishInstagramContainer(ctx.igToken!, containerId) : publishThreadsContainer(ctx.config!, containerId);
}
async function markPosted(id: string, externalId: string) {
  const { data, error } = await db().from("locapass_threads_posts").update({ status: "posted", external_id: externalId, posted_at: new Date().toISOString(), error: null }).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("投稿はできましたが、記録の更新に失敗しました。二重に投稿しないよう確認してください");
}
async function markFailed(id: string, message: string) {
  await db().from("locapass_threads_posts").update({ status: "failed", error: message.slice(0, 400) }).eq("id", id);
}

/** 動画の投稿: コンテナを作る → Metaの処理を待つ(最大75秒) → 公開。間に合わなければ「処理中」にして、あとは定期処理(30分おき)が公開する。 */
async function publishVideoDraft(ctx: VideoCtx): Promise<void> {
  const admin = db();
  // 二重に動かないよう、状態を「処理中」に変えられたものだけ進める。
  const { data: claimed } = await admin.from("locapass_threads_posts").update({ status: "processing", processing_since: new Date().toISOString(), scheduled_at: null }).eq("id", ctx.id).eq("status", ctx.status).select("id");
  if (!claimed?.length) throw new Error("この投稿は、いま別の処理で動いています");
  try {
    const containerId = ctx.isInstagram
      ? await createInstagramReelContainer(ctx.igToken!, { caption: ctx.body, videoUrl: ctx.videoUrl })
      : await createThreadsVideoContainer(ctx.config!, { text: ctx.body, videoUrl: ctx.videoUrl });
    await admin.from("locapass_threads_posts").update({ container_id: containerId }).eq("id", ctx.id);
    const startedAt = Date.now();
    while (Date.now() - startedAt < VIDEO_WAIT_MS) {
      const st = await stateOf(ctx, containerId);
      if (st.state === "finished") { await markPosted(ctx.id, await publishContainer(ctx, containerId)); return; }
      if (st.state === "error") throw new Error(`動画の処理に失敗しました: ${st.message ?? "不明"}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    // 間に合わなかった: 「処理中」のまま残す(定期処理が続きを公開する)。
  } catch (e) {
    const message = e instanceof Error ? e.message : "動画の投稿に失敗しました";
    await markFailed(ctx.id, message);
    throw new Error(message);
  }
}

/** 「処理中」の動画を確認して、終わっていれば公開する(定期処理から呼ぶ)。 */
export async function finalizeProcessingVideos(): Promise<{ id: string; result: string }[]> {
  const admin = db();
  const { data } = await admin.from("locapass_threads_posts").select("id, body, video_url, container_id, platform, account, processing_since").eq("status", "processing").lt("processing_since", new Date(Date.now() - 2 * 60_000).toISOString()).limit(5);
  const out: { id: string; result: string }[] = [];
  for (const row of (data ?? []) as any[]) {
    const isInstagram = row.platform === "instagram";
    try {
      if (!row.container_id) { await markFailed(row.id, "動画の処理が途中で止まりました(コンテナなし)"); out.push({ id: row.id, result: "failed" }); continue; }
      if (Date.now() - new Date(row.processing_since).getTime() > VIDEO_GIVE_UP_MS) { await markFailed(row.id, "動画の処理が40分たっても終わりませんでした"); out.push({ id: row.id, result: "timeout" }); continue; }
      const threadsToken = isInstagram ? null : await resolveSocialToken("threads", row.account);
      const ctx = { isInstagram, igToken: isInstagram ? await resolveSocialToken("instagram", row.account) : null, config: threadsToken ? { userId: process.env.THREADS_USER_ID?.trim() || null, accessToken: threadsToken } : null };
      const st = await stateOf(ctx, row.container_id);
      if (st.state === "finished") {
        // 公開の直前に、もう一度「処理中」の印を取り直して、二重に公開しない。
        const { data: claimed } = await admin.from("locapass_threads_posts").update({ processing_since: new Date().toISOString() }).eq("id", row.id).eq("status", "processing").eq("processing_since", row.processing_since).select("id");
        if (!claimed?.length) { out.push({ id: row.id, result: "busy" }); continue; }
        await markPosted(row.id, await publishContainer(ctx, row.container_id));
        out.push({ id: row.id, result: "posted" });
      } else if (st.state === "error") { await markFailed(row.id, `動画の処理に失敗しました: ${st.message ?? "不明"}`); out.push({ id: row.id, result: "failed" }); }
      else out.push({ id: row.id, result: "pending" });
    } catch (e) {
      await markFailed(row.id, e instanceof Error ? e.message : "動画の公開に失敗しました");
      out.push({ id: row.id, result: "failed" });
    }
  }
  return out;
}

/** 掲載店舗の動画(自前のサーバーにあるもの)で、リール/動画の下書きを作る。 */
export async function createVideoDraft(dest: Destination): Promise<string> {
  const rows = (await recentRows()).filter((r) => r.account === dest.account);
  const video = await pickShopVideo(rows.filter((r) => r.topic.startsWith("reel:")).map((r) => r.topic.slice(5)), dest.account);
  const site = dest.account === "luxela" ? { url: "https://luxela.jp", name: "LUXELA" } : { url: "https://locapass.net", name: "LOCAPASS" };
  const link = video.shopCode ? `${site.url}/s/${video.shopCode}` : site.url;
  const body = [`🎬 ${video.shopName}`, `動画・詳細は${site.name}で\n${link}`, video.instagramHandle ? `@${video.instagramHandle}` : ""].filter(Boolean).join("\n\n");
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: `reel:${video.key}`, body, video_url: video.videoUrl, source: "manual", status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
  if (error || !data) throw new Error(`下書きの保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}


/** 管理画面からアップロードした動画(R2の social/ 以下)で、下書きを作る。形式・大きさは、実際のファイルで確認する。 */
export async function createUploadedVideoDraft(input: { dest: Destination; videoUrl: string; text: string }): Promise<string> {
  const { R2_PUBLIC_BASE_URL } = await import("@/lib/storage/r2");
  if (!input.videoUrl.startsWith(`${R2_PUBLIC_BASE_URL}/social/`)) throw new Error("動画のURLが正しくありません");
  const text = checkManualText(input.text, input.dest.platform);
  const head = await fetch(input.videoUrl, { method: "HEAD", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!head?.ok) throw new Error("アップロードした動画を確認できませんでした。もう一度アップロードしてください");
  const type = head.headers.get("content-type") ?? "";
  const size = Number(head.headers.get("content-length") ?? 0);
  if (!/^video\/(mp4|quicktime)/i.test(type)) throw new Error("動画の形式が正しくありません(MP4またはMOV)");
  if (size > 200 * 1024 * 1024) throw new Error("動画は200MB以下にしてください");
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: "upload-video", body: text, video_url: input.videoUrl, source: "manual", status: "draft", platform: input.dest.platform, account: input.dest.account }).select("id").single();
  if (error || !data) throw new Error(`下書きの保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}

// ───── 統合の「投稿をつくる」: 投稿先 → 形 → 文章(自動/手書き) → 素材(手動/自動/AI生成) ─────

export type ComposeForm = "feed" | "reel" | "post";
export type ComposeText = { mode: "manual"; body: string } | { mode: "auto"; audience: ThreadsAudience | "auto"; note: string };
export type ComposeMedia = { kind: "none" } | { kind: "upload-photo"; url: string } | { kind: "upload-video"; url: string } | { kind: "shop-photo" } | { kind: "shop-video" } | { kind: "ai-image" } | { kind: "reel-ai" } | { kind: "reel-shop-photo" } | { kind: "reel-upload-photo"; url: string };
export type ComposeInput = { dest: Destination; form: ComposeForm; text: ComposeText; media: ComposeMedia; style?: "photo" | "illustration" | "flyer"; headline?: string };
const REEL_FROM_IMAGE = ["reel-ai", "reel-shop-photo", "reel-upload-photo"];

/** 形と素材の組み合わせが成り立つか確認する。 */
function checkCompose(input: ComposeInput): void {
  const { dest, form, media } = input;
  if (dest.platform === "instagram") {
    if (form === "feed" && !["upload-photo", "shop-photo", "ai-image"].includes(media.kind)) throw new Error("Instagramのフィードは、写真(手動・店舗の写真・AI画像)が必要です");
    if (form === "reel" && !["upload-video", "shop-video", ...REEL_FROM_IMAGE].includes(media.kind)) throw new Error("Instagramのリールは、動画か、画像から作る動画が必要です");
    if (form === "post") throw new Error("Instagramでは、フィードかリールを選んでください");
  } else if (form !== "post") {
    throw new Error("Threadsは「投稿」を選んでください");
  }
}

export type PreparedCompose = { topicId: string; body: string; source: "ai" | "manual"; imageUrl: string | null; videoUrl: string | null };

/** 4つの質問の答えから、文章と素材を用意する(保存はしない)。 */
export async function prepareCompose(input: ComposeInput): Promise<PreparedCompose> {
  checkCompose(input);
  const { dest, text, media } = input;
  const rows = (await recentRows()).filter((r) => r.account === dest.account);
  const site = dest.account === "luxela" ? { url: "https://luxela.jp", name: "LUXELA" } : { url: "https://locapass.net", name: "LOCAPASS" };

  // 素材(店舗のものは、先に選ぶ。店名・リンクを定型文に使うため)
  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  let shopKeyTopic: string | null = null;
  let template: string | null = null;
  if (media.kind === "upload-photo" || media.kind === "reel-upload-photo") imageUrl = media.url;
  if (media.kind === "upload-video") videoUrl = media.url;
  if (media.kind === "shop-photo" || media.kind === "reel-shop-photo") {
    const photo = await pickShopPhoto(rows.filter((r) => r.topic.startsWith("shop:")).map((r) => r.topic.slice(5)), dest.account);
    imageUrl = photo.imageUrl;
    shopKeyTopic = `shop:${photo.recentlyUsedKey}`;
    const link = photo.shopCode ? `${site.url}/s/${photo.shopCode}` : site.url;
    template = [`📍 ${photo.shopName}`, photo.description, `${dest.account === "luxela" ? "出勤・詳細" : "動画・詳細"}は${site.name}で\n${link}`, photo.instagramHandle ? `@${photo.instagramHandle}` : ""].filter(Boolean).join("\n\n");
  }
  if (media.kind === "shop-video") {
    const video = await pickShopVideo(rows.filter((r) => r.topic.startsWith("reel:")).map((r) => r.topic.slice(5)), dest.account);
    videoUrl = video.videoUrl;
    shopKeyTopic = `reel:${video.key}`;
    const link = video.shopCode ? `${site.url}/s/${video.shopCode}` : site.url;
    template = [`🎬 ${video.shopName}`, `動画・詳細は${site.name}で\n${link}`, video.instagramHandle ? `@${video.instagramHandle}` : ""].filter(Boolean).join("\n\n");
  }

  // 文章
  let body: string;
  let topicId = shopKeyTopic ?? "manual";
  let source: "ai" | "manual" = "manual";
  let theme = "街の雰囲気";
  if (text.mode === "manual") {
    body = checkManualText(text.body, dest.platform); // 手書きの文章は、画像のテーマに使わない(文字として描かれてしまうため)
  } else if (template) {
    body = template; // 店舗の写真・動画のときは、店名・リンク・タグの定型文
  } else {
    const t = pickTopic(rows, text.audience === "auto" ? undefined : text.audience, dest.account);
    const written = await writeThreadsPost(t, rows.map((r) => r.body), dest.account, text.note);
    if (!written.ok) throw new Error(written.error);
    body = written.text;
    topicId = t.id;
    source = "ai";
    theme = t.title;
  }

  if (media.kind === "ai-image") imageUrl = await generateAiImage(theme, dest.account, { style: input.style, headline: input.headline });
  if (media.kind === "reel-ai") imageUrl = await generateAiImage(theme, dest.account, { style: input.style, aspect: "9:16" });
  return { topicId, body, source, imageUrl, videoUrl };
}

/** 4つの質問の答えから、下書きを1件作る。公開はしない。(画像から作るリールは、ブラウザで動画にしてから saveReelDraft で保存する) */
export async function composeDraft(input: ComposeInput): Promise<string> {
  if (REEL_FROM_IMAGE.includes(input.media.kind)) throw new Error("画像から作るリールは、動画に変換してから保存します");
  const { dest } = input;
  const { topicId, body, source, imageUrl, videoUrl } = await prepareCompose(input);
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: topicId, body, image_url: imageUrl, video_url: videoUrl, source, status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
  if (error || !data) throw new Error(`下書きの保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}


/** ブラウザで作った動画(画像から作ったリール)を、下書きとして保存する。動画は R2 の social/ 以下だけ。 */
export async function saveReelDraft(input: { dest: Destination; videoUrl: string; body: string; topicId: string; source: "ai" | "manual" }): Promise<string> {
  const { R2_PUBLIC_BASE_URL } = await import("@/lib/storage/r2");
  if (!input.videoUrl.startsWith(`${R2_PUBLIC_BASE_URL}/social/`)) throw new Error("動画のURLが正しくありません");
  const head = await fetch(input.videoUrl, { method: "HEAD", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!head?.ok || !/^video\/(mp4|quicktime)/i.test(head.headers.get("content-type") ?? "")) throw new Error("アップロードした動画を確認できませんでした");
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: input.topicId, body: input.body, video_url: input.videoUrl, source: input.source, status: "draft", platform: input.dest.platform, account: input.dest.account }).select("id").single();
  if (error || !data) throw new Error(`下書きの保存に失敗しました: ${error?.message ?? "0件"}`);
  return data.id as string;
}
