import { NextResponse } from "next/server";
import { getPetSpotsInBounds } from "@/lib/pet/spots";

/**
 * おでかけの地図: 見えている範囲のペット施設・一緒に行ける店。
 * GET /api/pet/spots?minLat=&maxLat=&minLng=&maxLng=
 * 公開情報だけなので、CDNで1分キャッシュする(範囲は小数3桁に丸めてキャッシュを効かせる)。
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const n = (k: string) => Number(sp.get(k));
  const b = { minLat: n("minLat"), maxLat: n("maxLat"), minLng: n("minLng"), maxLng: n("maxLng") };
  const valid =
    Object.values(b).every(Number.isFinite) && b.minLat < b.maxLat && b.minLng < b.maxLng && b.maxLat - b.minLat <= 30 && b.maxLng - b.minLng <= 40 && Math.abs(b.minLat) <= 90 && Math.abs(b.minLng) <= 180;
  if (!valid) return NextResponse.json({ error: "範囲が正しくありません" }, { status: 400 });
  const { spots, truncated } = await getPetSpotsInBounds(b);
  return NextResponse.json({ spots, truncated }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
