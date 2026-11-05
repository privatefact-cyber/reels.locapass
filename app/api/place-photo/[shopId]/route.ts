import { NextResponse } from "next/server";

// Googleの写真(Places Photo)の中継口だった。表示のたびに有料APIを呼ぶため、2026-11-06に全面的に停止した
// (Google系の有料APIは使わない方針。写真は店舗のアップロード・みんなのフォト・無料の写真素材のみ)。
// 古いURLが残っていても Google を呼ばないよう、常に「写真なし」を返す。
export function GET() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
