import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 90;
const REELS_PUBLIC_PREFIX = "/storage/v1/object/public/reels/";

function extractStoragePath(url: string): string | null {
  const idx = url.indexOf(REELS_PUBLIC_PREFIX);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + REELS_PUBLIC_PREFIX.length));
}

// Vercel Cron から定期実行し、古いリールの動画ファイルとレコードを削除して
// ストレージ/転送量コストが際限なく積み上がるのを防ぐ。
// しきい値は環境変数 RETENTION_DAYS で調整可能(未設定なら90日)。
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const retentionDays = Number(process.env.RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  const { data: staleReels, error: selectError } = await supabase
    .from("reels")
    .select("id, media, preview_url, created_at")
    .lt("created_at", cutoff);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!staleReels || staleReels.length === 0) {
    return NextResponse.json({ deletedReels: 0, deletedFiles: 0 });
  }

  // マップカード用の軽量プレビュー(preview_url)も、元動画と一緒に消す。
  const storagePaths = staleReels
    .flatMap((reel) => [
      ...(((reel.media as { url: string }[]) ?? []).map((m) => m.url)),
      ...(reel.preview_url ? [reel.preview_url] : []),
    ])
    .map((url) => extractStoragePath(url))
    .filter((p): p is string => Boolean(p));

  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from("reels").remove(storagePaths);
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase
    .from("reels")
    .delete()
    .lt("created_at", cutoff);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    deletedReels: staleReels.length,
    deletedFiles: storagePaths.length,
    retentionDays,
  });
}
