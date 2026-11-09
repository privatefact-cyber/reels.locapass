import { createAdminClient } from "@/lib/supabase/admin";
import { publishThreadsImagePost, publishThreadsTextPost, threadsConfigFromEnv } from "@/lib/social/threads";
import { instagramTokenFor, publishInstagramImagePost, type SocialAccount } from "@/lib/social/instagram";
import { THREADS_TOPICS, type ThreadsAudience, type ThreadsTopic } from "@/lib/social/threadsTopics";
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
  source: "ai" | "manual";
  platform: "threads" | "instagram";
  account: SocialAccount;
  status: "draft" | "scheduled" | "posted" | "failed" | "discarded";
  error: string | null;
  created_at: string;
  posted_at: string | null;
  scheduled_at: string | null;
};
const COLUMNS = "id, topic, body, image_url, source, platform, account, status, error, created_at, posted_at, scheduled_at";

/** 直近のAIの投稿(重複を避けるための材料)。破棄したものは除く。 */
async function recentRows(limit = 40): Promise<PostRow[]> {
  const { data, error } = await db().from("locapass_threads_posts").select(COLUMNS).neq("status", "discarded").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`直近の投稿の取得に失敗しました: ${error.message}`);
  return (data ?? []) as PostRow[];
}

/** 直近の投稿の読者(店舗向け/一般向け)。テーマIDから分かる。 */
function audienceOf(topicId: string): ThreadsAudience | null {
  return THREADS_TOPICS.find((t) => t.id === topicId)?.audience ?? null;
}

/** 読者を指定しなければ、直近の投稿と逆の読者(店舗向けと一般向けを交互)にする。最近使っていないテーマを選ぶ。 */
function pickTopic(rows: PostRow[], audience?: ThreadsAudience): ThreadsTopic {
  const last = rows.filter((r) => r.source === "ai").map((r) => audienceOf(r.topic)).find((a): a is ThreadsAudience => a !== null);
  const wanted: ThreadsAudience = audience ?? (last === "public" ? "shop" : "public");
  const pool = THREADS_TOPICS.filter((t) => t.audience === wanted);
  const lastUsed = new Map<string, number>();
  rows.forEach((r, index) => { if (!lastUsed.has(r.topic)) lastUsed.set(r.topic, index); });
  const unused = pool.filter((t) => !lastUsed.has(t.id));
  if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)];
  return [...pool].sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0))[0];
}

export type DraftResult = { ok: true; id: string; topic: string; text: string } | { ok: false; error: string };

/** AIの下書きを1本作って保存する。dry=true なら、保存せずに文章だけ返す。 */
export async function createThreadsDraft(options?: { dry?: boolean; audience?: ThreadsAudience }): Promise<DraftResult> {
  const rows = await recentRows();
  const topic = pickTopic(rows, options?.audience);
  const written = await writeThreadsPost(topic, rows.map((r) => r.body));
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
export async function createImageDraft(kind: "shop" | "ai", dest: Destination): Promise<string> {
  const admin = db();
  const rows = await recentRows();
  let body: string;
  let imageUrl: string;
  let topic: string;
  if (kind === "shop") {
    const photo = await pickShopPhoto(rows.filter((r) => r.topic.startsWith("shop:")).map((r) => r.topic.slice(5)));
    const link = photo.shopCode ? `https://locapass.net/s/${photo.shopCode}` : "https://locapass.net";
    body = [`📍 ${photo.shopName}`, photo.description, `動画・詳細はLOCAPASSで\n${link}`, photo.instagramHandle ? `@${photo.instagramHandle}` : ""].filter(Boolean).join("\n\n");
    imageUrl = photo.imageUrl;
    topic = `shop:${photo.recentlyUsedKey}`;
  } else {
    const t = pickTopic(rows, "public");
    const written = await writeThreadsPost(t, rows.map((r) => r.body));
    if (!written.ok) throw new Error(written.error);
    body = written.text;
    imageUrl = await generateAiImage(t.title);
    topic = t.id;
  }
  const { data, error } = await admin.from("locapass_threads_posts").insert({ topic, body, image_url: imageUrl, source: "ai", status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
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
  const { data: row, error } = await admin.from("locapass_threads_posts").select("id, body, image_url, source, platform, account, status").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "下書きが見つかりません");
  if (row.status !== "draft" && row.status !== "scheduled") throw new Error("この投稿は、すでに処理済みです");
  const isInstagram = row.platform === "instagram";
  const config = isInstagram ? null : threadsConfigFromEnv(row.account);
  const igToken = isInstagram ? instagramTokenFor(row.account) : null;
  if (isInstagram && !igToken) throw new Error(`Instagram(${row.account})のトークンが未設定です`);
  if (isInstagram && !row.image_url) throw new Error("Instagramは写真が必要です。写真を付けてください");
  if (!isInstagram && !config) throw new Error(`Threads(${row.account})のトークンが未設定です`);
  // AIが書いた文章は、投稿の直前にもう一度、安全チェックをする。自分で書いた文章は、文字数だけ確認する。
  if (row.source === "ai") {
    const problem = validateThreadsText(row.body, []);
    if (problem) throw new Error(`投稿できない文章です: ${problem}`);
  } else if (row.body.length > (isInstagram ? 2200 : THREADS_MAX_CHARS + 20)) {
    throw new Error("文章が長すぎます");
  }
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
