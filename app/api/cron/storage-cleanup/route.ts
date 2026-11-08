import { NextResponse } from "next/server";
import { runStorageCleanup } from "@/lib/storage/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** 設定されていて正の数ならその値、そうでなければ null(=その掃除は無効)。 */
function optionalDaysEnv(name: string): number | null {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/**
 * 毎日、R2の不要ファイルを掃除する(vercel.json の crons から呼ばれる)。詳細は lib/storage/retention.ts。
 *
 * 既定はドライラン(何も消さず、消す予定のものを返すだけ)。実際に消すには環境変数 R2_CLEANUP_APPLY=1。
 * ?dry=1 を付けると、環境変数に関わらず必ずドライランになる(動作確認用)。
 * ?pages=N で、1回に走査するR2の一覧ページ数(1ページ=最大1000件)を変えられる。
 *
 * 環境変数:
 *  R2_CLEANUP_APPLY=1            実際に削除する
 *  R2_ORPHAN_GRACE_DAYS          孤児とみなすまでの猶予(既定7日)
 *  CAST_WITHDRAWN_RETENTION_DAYS 退会後にリールを消すまでの猶予(既定30日)
 *  ZERO_VIEW_REEL_DAYS           閲覧・いいね・コメントが一切ない古いリールを消す日数(未設定なら無効)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const apply = process.env.R2_CLEANUP_APPLY === "1" && url.searchParams.get("dry") !== "1";
  const pagesParam = Number(url.searchParams.get("pages"));

  try {
    const report = await runStorageCleanup({
      apply,
      graceDays: intEnv("R2_ORPHAN_GRACE_DAYS", 7),
      castWithdrawnDays: optionalDaysEnv("CAST_WITHDRAWN_RETENTION_DAYS") ?? 30,
      zeroViewDays: optionalDaysEnv("ZERO_VIEW_REEL_DAYS"),
      maxPages: Number.isFinite(pagesParam) && pagesParam > 0 ? Math.min(Math.floor(pagesParam), 200) : 50,
      rowLimit: 500,
      timeBudgetMs: 240_000,
    });
    return NextResponse.json(report, { status: report.errors.length > 0 ? 502 : 200 });
  } catch (error) {
    console.error("R2の掃除に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "storage cleanup failed" }, { status: 502 });
  }
}
