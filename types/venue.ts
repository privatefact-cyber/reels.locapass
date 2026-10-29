// locapass_shops.categoryはサイトごとの自由入力のため、LUXELA側のような固定ジャンル
// 列挙(ShopGenre)ではなくstringで扱う。
export type NightlifeGenre = "all" | string;

export interface CastSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  isWorkingNow: boolean;
}

export interface VenueLocation {
  lat: number;
  lng: number;
  buildingName?: string;
  floor?: string;
  addressEn?: string;
}

/** 地図に打つだけの軽量データ。広域ズーム時はこれしか取得しない。 */
export interface VenuePin {
  id: string;
  lat: number;
  lng: number;
  genre: string | null;
  isSponsored: boolean;
  /** 拡大したときに丸いサムネイルとして出す店舗の画像(軽量版)。画像が無い店舗・Google写真の店舗はnull(点のまま)。 */
  thumbUrl: string | null;
  /**
   * 同じ場所(雑居ビルの別フロアなど)に店舗が複数あるとき、ピンは「一番情報が新しい店」1つにまとめる。
   * そのときの、まとめた店舗すべてのID(代表の店も含む)。まとめていないピンでは未指定。
   */
  memberIds?: string[];
  /** 移動販売(キッチンカー)の出店予定。ある店のピンは、営業中ならOPEN、まだなら予定の日時つきで描く。 */
  spot?: VenueSpot;
}

/** 移動販売の出店場所の時間枠(ISO文字列)。営業中かどうかは、表示する側が今の時刻と比べて決める。 */
export interface VenueSpot {
  startsAt: string;
  endsAt: string;
  address: string | null;
  /** ピン(軽量データ)だけに付く、密集時の一覧に出す店の情報。 */
  shop?: { name: string; href: string; imageUrl: string | null; genre: string | null };
}

export interface VenueCardData {
  id: string;
  name: string;
  slug: string;
  portalSlug: string;
  area: string | null;
  genre: string | null;
  location: VenueLocation;
  distanceMeter: number | null;
  /**
   * カードに流す動画。動画オプション契約店舗だけに入る(それ以外は常にnull)。
   * 店舗が選んだリール → 無ければ最新の動画リール。軽量プレビューがあればそちらを使う。
   */
  previewVideoUrl: string | null;
  /** カードの画像(動画のポスターも兼ねる)。トップヒーロー画像 → メイン画像。無ければnull(LOCAPASSの黒背景)。 */
  imageUrl: string | null;
  /** imageUrl がGoogle Places写真のときだけ入る撮影者クレジット(表示必須)。 */
  imageAttribution?: { name?: string; uri?: string | null } | null;
  /** 公開リール数(ストーリーは含まない)。0件の店舗はカードをタップしても全画面リールを開かず店舗ページへ。 */
  reelCount: number;
  isSponsored: boolean;
  sponsoredRank?: number;
  supportsEnglish: boolean;
  isVerified: boolean;
  casts: CastSummary[];
  /** 移動販売の出店場所(営業中または予定)。無ければ通常の固定店舗。 */
  spot?: VenueSpot;
}
