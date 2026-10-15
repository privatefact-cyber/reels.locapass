export type BoostItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  discountTag: string | null;
  createdAt: string;
  expiresAt: string;
  durationMinutes: number;
  shop: {
    id: string;
    name: string;
    genre: string | null;
    tel: string | null;
    lineUrl: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    iconUrl: string | null;
    shopPath: string | null;
  };
};

/** 掲載時間の選択肢(分)。店舗が1/2/3時間から選ぶ。DBの check と同じ値。既定は1時間。 */
export const BOOST_DURATIONS = [60, 120, 180] as const;
export const BOOST_MINUTES = 60;
export const BOOST_TAGS = ["無料提供", "半額", "80%OFF", "50%OFF", "ドリンク代のみ"] as const;
