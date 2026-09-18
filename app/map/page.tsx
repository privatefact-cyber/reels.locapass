import type { Metadata } from "next";
import { VenueMapExplorer } from "@/components/map/VenueMapExplorer";
import { getVenueGenres } from "@/lib/map/getVenues";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "マップで探す｜近くの店舗をGPSとリールでチェック - LOCAPASS",
  description:
    "現在地のまわりの店舗をマップと縦型動画で探せます。近くに無ければ地図を広げるか、住所で検索。",
};

/**
 * エリアを選ばせずにそのまま開く地図。
 * 「現在地 → 足りなければ地図を広げる → それでも無ければ住所検索」で探してもらう。
 */
export default async function MapPage() {
  // 店舗データはクライアントが「現在地の半径500m」「表示範囲」単位で取りに行く
  // (app/api/venues)。サーバー側で全国分を先読みしない。
  // ジャンルピルだけは掲載中店舗の実カテゴリ(全site横断)をここで集計して渡す。
  const genres = await getVenueGenres();
  return <VenueMapExplorer autoLocate genres={genres} />;
}
