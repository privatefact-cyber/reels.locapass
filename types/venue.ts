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
}

export interface VenueCardData {
  id: string;
  name: string;
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
  /** 公開リール数(ストーリーは含まない)。0件の店舗はカードをタップしても全画面リールを開かず店舗ページへ。 */
  reelCount: number;
  isSponsored: boolean;
  sponsoredRank?: number;
  supportsEnglish: boolean;
  isVerified: boolean;
  casts: CastSummary[];
}
