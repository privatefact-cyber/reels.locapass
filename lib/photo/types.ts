/** ポータルトップのPHOTOタブに出す、写真1枚ぶんの最小限の情報。 */
export type PhotoTeaser = {
  id: string;
  imageUrl: string;
  spotName: string;
  placeKind: "listed" | "spot" | "free" | null;
  /** 動画投稿(imageUrlはその1コマ)。 */
  isVideo?: boolean;
};
