import { createAdminClient } from "@/lib/supabase/admin";
import { publishThreadsTextPost, threadsConfigFromEnv } from "@/lib/social/threads";
import { THREADS_TOPICS, type ThreadsTopic } from "@/lib/social/threadsTopics";
import { validateThreadsText, writeThreadsPost } from "@/lib/social/threadsWriter";

/**
 * LOCAPASS公式Threadsへ、AIが書いた文章を投稿する。
 * THREADS_TEXT_MODE: "off"=何もしない / "draft"(既定)=毎日1本、下書きを作るだけ(管理画面で確認して投稿) / "auto"=確認なしで自動投稿。
 * 自動投稿の上限は、24時間で THREADS_TEXT_DAILY_MAX 本(既定1)。
 */
export type TextMode = "off" | "draft" | "auto";
export function textModeFromEnv(): TextMode {
  const v = (process.env.THREADS_TEXT_MODE ?? "draft").trim().toLowerCase();
  return v === "off" || v === "auto" ? v : "draft";
}

const MAX_PENDING_DRAFTS = 3;
const db = () => createAdminClient() as any;

type Row = { id: string; topic: string; body: string; status: string; error: string | null; created_at: string; posted_at: string | null };

/** 直近の投稿(重複を避けるための材料)。下書き・投稿済み・失敗を含み、破棄したものは除く。 */
async function recentRows(limit = 40): Promise<Row[]> {
  const { data, error } = await db().from("locapass_threads_posts").select("id, topic, body, status, error, created_at, posted_at").neq("status", "discarded").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`直近の投稿の取得に失敗しました: ${error.message}`);
  return (data ?? []) as Row[];
}

/** 最近使っていないテーマを選ぶ(全部使っていたら、いちばん昔に使ったもの)。 */
function pickTopic(rows: Row[]): ThreadsTopic {
  const lastUsed = new Map<string, number>();
  rows.forEach((r, index) => { if (!lastUsed.has(r.topic)) lastUsed.set(r.topic, index); });
  const unused = THREADS_TOPICS.filter((t) => !lastUsed.has(t.id));
  if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)];
  return [...THREADS_TOPICS].sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0))[0];
}

export type DraftResult = { ok: true; id: string; topic: string; text: string } | { ok: false; error: string };

/** 下書きを1本作って保存する。dry=true なら、保存せずに文章だけ返す。 */
export async function createThreadsDraft(options?: { dry?: boolean }): Promise<DraftResult> {
  const rows = await recentRows();
  const topic = pickTopic(rows);
  const written = await writeThreadsPost(topic, rows.map((r) => r.body));
  if (!written.ok) return { ok: false, error: written.error };
  if (options?.dry) return { ok: true, id: "dry-run", topic: topic.id, text: written.text };
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: topic.id, body: written.text, status: "draft" }).select("id").single();
  if (error || !data) return { ok: false, error: `下書きの保存に失敗しました: ${error?.message ?? "0件"}` };
  return { ok: true, id: data.id as string, topic: topic.id, text: written.text };
}

/** 下書きをThreadsに投稿する。失敗しても、理由を記録に残す(同じ文章を勝手に再投稿しない)。 */
export async function publishThreadsDraft(id: string): Promise<void> {
  const admin = db();
  const { data: row, error } = await admin.from("locapass_threads_posts").select("id, body, status").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "下書きが見つかりません");
  if (row.status !== "draft") throw new Error("この投稿は、すでに処理済みです");
  const config = threadsConfigFromEnv();
  if (!config) throw new Error("THREADS_ACCESS_TOKEN が未設定です");
  // 投稿の直前にもう一度確認する(自分の過去の投稿との重複は、ここでは見ない)。
  const problem = validateThreadsText(row.body, []);
  if (problem) throw new Error(`投稿できない文章です: ${problem}`);
  try {
    const externalId = await publishThreadsTextPost(config, { text: row.body });
    const { data: updated, error: updateError } = await admin.from("locapass_threads_posts").update({ status: "posted", external_id: externalId, posted_at: new Date().toISOString(), error: null }).eq("id", id).eq("status", "draft").select("id");
    if (updateError || !updated?.length) throw new Error("投稿はできましたが、記録の更新に失敗しました。Threadsで二重に投稿しないよう確認してください");
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "投稿に失敗しました";
    await admin.from("locapass_threads_posts").update({ status: "failed", error: message }).eq("id", id).eq("status", "draft");
    throw new Error(message);
  }
}

export async function discardThreadsDraft(id: string): Promise<void> {
  const { data, error } = await db().from("locapass_threads_posts").update({ status: "discarded" }).eq("id", id).eq("status", "draft").select("id");
  if (error) throw new Error(`破棄に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("破棄できませんでした(対象が見つからないか、処理済みです)");
}

/** cronから呼ぶ。モードに応じて、下書きを作る/自動投稿する。dry=true なら文章を作るだけで何も保存・投稿しない。 */
export async function runThreadsTextCron(options: { dry: boolean }) {
  const mode = textModeFromEnv();
  if (options.dry) {
    const draft = await createThreadsDraft({ dry: true });
    return { mode, dry: true, result: draft };
  }
  if (mode === "off") return { mode, skipped: "off" as const };

  const admin = db();
  if (mode === "draft") {
    const { data: pending } = await admin.from("locapass_threads_posts").select("id").eq("status", "draft");
    if ((pending?.length ?? 0) >= MAX_PENDING_DRAFTS) return { mode, skipped: "drafts-pending" as const, pending: pending.length };
    return { mode, result: await createThreadsDraft() };
  }

  // auto: 24時間の投稿数の上限を守る。
  const dailyMax = Number(process.env.THREADS_TEXT_DAILY_MAX ?? 1) || 1;
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: posted } = await admin.from("locapass_threads_posts").select("id").eq("status", "posted").gte("posted_at", since);
  if ((posted?.length ?? 0) >= dailyMax) return { mode, skipped: "daily-cap" as const };
  const draft = await createThreadsDraft();
  if (!draft.ok) return { mode, result: draft };
  await publishThreadsDraft(draft.id);
  return { mode, result: draft, published: true };
}

export async function listThreadsPosts(): Promise<Row[]> {
  const { data, error } = await db().from("locapass_threads_posts").select("id, topic, body, status, error, created_at, posted_at").order("created_at", { ascending: false }).limit(40);
  if (error) throw new Error(`一覧の取得に失敗しました: ${error.message}`);
  return (data ?? []) as Row[];
}
