import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

/**
 * R2(動画ファイル)の掃除。
 *
 * 方針: リールは店舗の資産なので「古いから消す」はしない。消すのは次の2種類だけ。
 *  1) 孤児ファイル: どのリールからも参照されていないR2のファイル。
 *     投稿の取り消し・本人/店舗による削除(DBの行だけ消えてファイルが残る)・途中離脱の残骸・退会で行が消えた分など。
 *  2) 無料プランの店の古い動画。店が上げた最新の動画1本は必ず残し、それより古い動画(公開中・書庫を問わず)を
 *     一定日数(既定30日)で削除する(動画を全部消すと店のページが真っ黒になるため。規約に明記する前提)。
 *     公開中のより新しい動画が別にあるときだけ消すので、有料プランは対象外、公開中の動画が無い店は何も消えない。
 *
 * リールの持ち主は店舗。キャストの退店・退会を理由にリールは消さない(退店時は店が「書庫に残す/削除」を選ぶ)。
 * 2は「リールの行」を消す。ファイルは次回以降の1(孤児掃除)が、猶予期間を置いてから消す。
 * つまりDBの行を誤って消しても、ファイルは猶予の間は残る。
 *
 * 既定はドライラン(何も消さず、消す予定のものを報告するだけ)。
 * 実際に消すのは R2_CLEANUP_APPLY=1 のときだけ。
 */

const SWEEP_PREFIXES = ["reels/", "photo/"] as const;
const LIST_PAGE_SIZE = 1000;
// 1ページ分(最大1000件)のうち、この割合を超えて「孤児」と判定されたら異常とみなして消さない。
// (URLの組み立てミスや参照元DBの不調で、全部が孤児に見える事故を防ぐ保険)
const SUSPICIOUS_ORPHAN_RATIO = 0.5;
const SUSPICIOUS_MIN_CANDIDATES = 20;

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export type CleanupOptions = {
  /** true のときだけ実際に削除する。false はドライラン。 */
  apply: boolean;
  /** 孤児とみなすまでの猶予(日)。アップロード直後・投稿作成の途中のファイルを巻き込まないため。 */
  graceDays: number;
  /** 無料プランの古い動画を消すまでの日数(最新の1本は残す)。null なら対象外。 */
  freePlanVideoDays: number | null;
  /** 上の掃除の対象にするプラン(無料プラン)。 */
  freePlans: string[];
  /** 1回の実行で走査するR2の一覧ページ数(1ページ=最大1000件)。 */
  maxPages: number;
  /** 1回の実行でDBから消すリール行数の上限。 */
  rowLimit: number;
  /** 1回の実行にかける時間の上限(ミリ秒)。 */
  timeBudgetMs: number;
};

export type SweepReport = {
  prefix: string;
  scanned: number;
  tooNew: number;
  orphans: number;
  deleted: number;
  suspiciousPages: number;
  nextCursor: string | null;
  finishedCycle: boolean;
  sampleOrphans: string[];
};

export type CleanupReport = {
  mode: "apply" | "dry-run";
  rows: { reason: string; found: number; deleted: number; sampleIds: string[] }[];
  sweeps: SweepReport[];
  errors: string[];
};

function admin() {
  const client = createAdminClient();
  // 新しいRPC/テーブルは生成済みの型にまだ無いので、ここだけ型を緩める。
  return client as unknown as {
    rpc: Rpc;
    from: (table: string) => any;
  };
}

async function loadCursor(key: string): Promise<string | null> {
  const { data, error } = await admin().from("storage_cleanup_state").select("cursor").eq("key", key).maybeSingle();
  if (error) throw new Error(`走査位置の読み込みに失敗: ${error.message}`);
  return (data?.cursor as string | null | undefined) ?? null;
}

async function saveCursor(key: string, cursor: string | null) {
  const { error } = await admin()
    .from("storage_cleanup_state")
    .upsert({ key, cursor, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`走査位置の保存に失敗: ${error.message}`);
}

/** 1) 孤児ファイルの掃除。R2を一覧で順に見て、DBから参照されていないファイルを消す。 */
async function sweepOrphans(prefix: string, options: CleanupOptions, deadline: number): Promise<SweepReport> {
  const client = getR2Client();
  if (!client) throw new Error("R2 is not configured");

  const stateKey = `locapass:${prefix}`;
  let cursor = await loadCursor(stateKey);
  const cutoff = Date.now() - options.graceDays * 24 * 60 * 60 * 1000;
  const report: SweepReport = {
    prefix,
    scanned: 0,
    tooNew: 0,
    orphans: 0,
    deleted: 0,
    suspiciousPages: 0,
    nextCursor: cursor,
    finishedCycle: false,
    sampleOrphans: [],
  };

  for (let page = 0; page < options.maxPages && Date.now() < deadline; page++) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: cursor ?? undefined, MaxKeys: LIST_PAGE_SIZE }),
    );
    const objects = listed.Contents ?? [];
    report.scanned += objects.length;

    // 猶予内に作られたファイル(投稿の途中かもしれない)は判定しない。
    const candidates = objects
      .filter((o): o is typeof o & { Key: string } => Boolean(o.Key))
      .filter((o) => {
        const fresh = !o.LastModified || o.LastModified.getTime() > cutoff;
        if (fresh) report.tooNew++;
        return !fresh;
      })
      .map((o) => o.Key);

    if (candidates.length > 0) {
      const { data, error } = await admin().rpc("locapass_unreferenced_r2_keys", { p_keys: candidates, p_base: R2_PUBLIC_BASE_URL });
      // 参照元DBが確認できないときは、絶対に消さない。
      if (error) throw new Error(`参照確認に失敗(削除せず中断): ${error.message}`);
      const orphans = (data as string[] | null) ?? [];
      report.orphans += orphans.length;
      if (report.sampleOrphans.length < 10) report.sampleOrphans.push(...orphans.slice(0, 10 - report.sampleOrphans.length));

      const suspicious = candidates.length >= SUSPICIOUS_MIN_CANDIDATES && orphans.length / candidates.length > SUSPICIOUS_ORPHAN_RATIO;
      if (suspicious) {
        report.suspiciousPages++;
      } else if (options.apply && orphans.length > 0) {
        const result = await client.send(
          new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: orphans.map((Key) => ({ Key })), Quiet: true } }),
        );
        const failed = result.Errors?.length ?? 0;
        report.deleted += orphans.length - failed;
        if (failed > 0) throw new Error(`R2の削除に一部失敗: ${result.Errors?.[0]?.Message ?? "unknown"}`);
      }
    }

    cursor = listed.IsTruncated ? (listed.NextContinuationToken ?? null) : null;
    report.nextCursor = cursor;
    if (!cursor) {
      report.finishedCycle = true;
      break;
    }
  }

  // ドライランでは走査位置を進めない(次の本番実行が同じ範囲を見るようにする)。
  if (options.apply) await saveCursor(stateKey, report.nextCursor);
  return report;
}

/** 2) 無料プランの店の古い動画(最新の1本は残す)。DBの行を消す(ファイルは孤児掃除が後で消す)。 */
async function removeRows(options: CleanupOptions): Promise<CleanupReport["rows"]> {
  if (options.freePlanVideoDays === null || options.freePlans.length === 0) return [];

  const { data, error } = await admin().rpc("locapass_cleanup_reel_candidates", {
    p_days: options.freePlanVideoDays,
    p_plans: options.freePlans,
    p_limit: options.rowLimit,
  });
  if (error) throw new Error(`削除候補の抽出に失敗: ${error.message}`);

  const candidates = (data as { reel_id: string; reason: string }[] | null) ?? [];
  const byReason = new Map<string, string[]>();
  for (const c of candidates) byReason.set(c.reason, [...(byReason.get(c.reason) ?? []), c.reel_id]);

  const rows: CleanupReport["rows"] = [];
  for (const [reason, ids] of byReason) {
    let deleted = 0;
    if (options.apply) {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data: removed, error: deleteError } = await admin().from("locapass_reels").delete().in("id", chunk).select("id");
        if (deleteError) throw new Error(`リールの削除に失敗(${reason}): ${deleteError.message}`);
        deleted += (removed as unknown[] | null)?.length ?? 0;
      }
    }
    rows.push({ reason, found: ids.length, deleted, sampleIds: ids.slice(0, 10) });
  }
  return rows;
}

export async function runStorageCleanup(options: CleanupOptions): Promise<CleanupReport> {
  const deadline = Date.now() + options.timeBudgetMs;
  const report: CleanupReport = { mode: options.apply ? "apply" : "dry-run", rows: [], sweeps: [], errors: [] };

  // 先に行を消す → 同じ実行内では孤児扱いにならない(猶予があるため)ので、ファイルは後日の掃除で消える。
  try {
    report.rows = await removeRows(options);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const prefix of SWEEP_PREFIXES) {
    try {
      report.sweeps.push(await sweepOrphans(prefix, options, deadline));
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return report;
}
