import { permanentRedirect } from "next/navigation";

type PageParams = { prefecture: string; city: string };

/**
 * 旧URL(/{ポータル}/{エリア}/map)。地図は全国で1系統(/map)にしたので、
 * そのポータルの初期設定で開く全国地図へ恒久的に転送する(?preset= が知らないslugなら、通常の /map として開く)。
 * エリア(city)は使わない(中心・縮尺はポータルの map_preset で決まる)。
 */
export default async function LegacyAreaMapPage({ params }: { params: Promise<PageParams> }) {
  const { prefecture } = await params;
  permanentRedirect(`/map?preset=${encodeURIComponent(prefecture)}`);
}
