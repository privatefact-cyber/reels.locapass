export type BoostItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  discountTag: string | null;
  createdAt: string;
  expiresAt: string;
  shop: {
    id: string;
    name: string;
    tel: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    iconUrl: string | null;
    shopPath: string | null;
  };
};

/** 1時間限定。カード・API・DBトリガーで共通の掲載時間(分)。 */
export const BOOST_MINUTES = 60;
export const BOOST_TAGS = ["無料提供", "半額", "80%OFF", "50%OFF", "ドリンク代のみ"] as const;
