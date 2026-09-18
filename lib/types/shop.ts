export type HeroMediaType = "image" | "video";

export interface HeroMedia {
  type: HeroMediaType;
  url: string | null;
}

export interface SnsLinks {
  x?: string;
  instagram?: string;
  line?: string;
}

export interface Store {
  id: string;
  name: string;
  area: string | null;
  genre: string | null;
  address: string | null;
  phone: string | null;
  businessHours: string | null;
  priceInfo: string | null;
  description: string | null;
  coverImageUrl: string | null;
  websiteUrl: string | null;
  usageNotes: string | null;
  snsLinks: SnsLinks;
  hero: HeroMedia;
  tagline: string | null;
  /** 問い合わせ用LINE友だち追加URL(例: https://line.me/ti/p/...)。連絡モーダルで使用。 */
  lineContactUrl: string | null;
  /** 上記LINEのQRコード画像URL。設定されていれば連絡モーダルにプレビュー表示する。 */
  lineQrImageUrl: string | null;
}

export interface CastMedia {
  url: string;
  displayOrder: number;
}

export interface Cast {
  id: string;
  name: string;
  age: number | null;
  prText: string | null;
  photoUrl?: string | null;
  isWorkingToday: boolean;
  shiftLabel: string | null;
  /** 入店(登録)から2週間以内。CastCardの「NEW」バッジ表示に使う。 */
  isNew: boolean;
}

export interface PriceItem {
  id: string;
  name: string;
  durationMinutes: number | null;
  price: number;
}

export interface ShopEvent {
  id: string;
  title: string;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  galleryImageUrls: string[];
  isEnded: boolean;
}

/** ポータル横断のイベント特設リール用: 開催店舗の情報を持たせたイベント */
export interface PortalEvent {
  id: string;
  title: string;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string;
  galleryImageUrls: string[];
  shopId: string;
  shopName: string;
  area: string | null;
  genre: string | null;
}
