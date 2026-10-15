import { NextResponse } from "next/server";
import { sweepStale } from "@/lib/reservation/service";
import { reservationEnabled } from "@/lib/reservation/config";

export const dynamic = "force-dynamic";

/**
 * 放置された予約の自動処理(返答なしリクエストの辞退・来店処理漏れの解放)。
 * 定期実行から `Authorization: Bearer $CRON_SECRET` 付きで呼ぶ。機能オフのときは何もしない。
 * (お店・お客様の画面を開いたときにも同じ処理がその人の分だけ走るので、cron未設定でも動く。)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!reservationEnabled()) return NextResponse.json({ skipped: true });
  return NextResponse.json(await sweepStale());
}
