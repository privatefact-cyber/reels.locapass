import type { Metadata } from "next";
import { VenueMapExplorer } from "@/components/map/VenueMapExplorer";
import { getVenueGenres } from "@/lib/map/getVenues";
import { siteConfig } from "@/config/site";

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
  // 位置情報が拒否/未許可/取得失敗のときのフォールバック中心。
  // 未指定だと東京駅にフォールバックしてしまい、掲載店舗が無い地域になるため、
  // config/site.tsに用意済みの初期中心(現状は水戸)を渡す。
  return <VenueMapExplorer autoLocate initialCenter={siteConfig.map.initialCenter} genres={genres} />;
}
