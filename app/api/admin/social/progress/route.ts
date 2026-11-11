import { NextResponse } from "next/server";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { finalizeProcessingVideos, getPostProgress, VIDEO_WAIT_MS } from "@/lib/social/threadsPosts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 管理画面の進捗バー用。投稿の進み具合を返す。動画が「処理中」のまま取り残されていれば、ここで続きを公開する。 */
export async function GET(req: Request) {
  await requireRootAdmin();
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s)).slice(0, 10);
  if (!ids.length) return NextResponse.json({ rows: [] });
  try {
    await finalizeProcessingVideos({ ids, minAgeMs: VIDEO_WAIT_MS + 10_000 });
  } catch {
    // 確認に失敗しても、いまの状態は返す(定期処理が続きを見る)
  }
  try {
    return NextResponse.json({ rows: await getPostProgress(ids) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗しました" }, { status: 500 });
  }
}
