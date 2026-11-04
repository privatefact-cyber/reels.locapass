import type { Metadata } from "next";
import { VenueMapExplorer } from "@/components/map/VenueMapExplorer";
import { getVenueGenres } from "@/lib/map/getVenues";
import { getMapPreset } from "@/lib/map/mapPreset";
import { siteConfig } from "@/config/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "マップで探す｜近くの店舗をGPSとリールでチェック - LOCAPASS",
  description:
    "現在地のまわりの店舗をマップと縦型動画で探せます。近くに無ければ地図を広げるか、住所で検索。",
};

/**
 * 全国で1系統の地図。エリアを選ばせずにそのまま開く。
 * 「現在地 → 足りなければ地図を広げる → それでも無ければ住所検索」で探してもらう。
 * ?preset={ポータルのslug} で開いたときは、そのポータルの初期設定(locapass_portals.map_preset)の中心・縮尺・スイッチで開く。
 * ポータルは初期表示を決めるだけで、表示する店舗は絞らない(所属は「権利」だけ)。
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ preset?: string | string[] }> }) {
  const { preset: presetParam } = await searchParams;
  // 店舗データはクライアントが「現在地の半径500m」「表示範囲」単位で取りに行く
  // (app/api/venues)。サーバー側で全国分を先読みしない。
  // ジャンルピルだけは掲載中店舗の実カテゴリ(全site横断)をここで集計して渡す。
  const [genres, preset] = await Promise.all([
    getVenueGenres(),
    getMapPreset(typeof presetParam === "string" ? presetParam : null),
  ]);
  if (preset) {
    return (
      <VenueMapExplorer
        initialCenter={preset.center}
        initialZoom={preset.zoom}
        initialBounds={preset.bounds}
        initialLayers={preset.layers}
        genres={genres}
      />
    );
  }
  // 位置情報が拒否/未許可/取得失敗のときのフォールバック中心。
  // 未指定だと東京駅にフォールバックしてしまうため、
  // config/site.tsに用意済みの初期中心(現状は銀座)を渡す。
  return <VenueMapExplorer autoLocate initialCenter={siteConfig.map.initialCenter} genres={genres} />;
}
