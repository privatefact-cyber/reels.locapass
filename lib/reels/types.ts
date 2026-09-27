export type ReelItem = {
  id: string;
  caption: string | null;
  media: { type: "video" | "image"; url: string; poster?: string }[];
  likesCount: number;
  castId: string | null;
  castName: string;
  castAvatarUrl: string | null;
  shopId: string;
  shopName: string;
  /** 公開URL組み立て用(reelProfileUrl/reelCtaUrl)。店舗は必ず所属ポータルとslugを持つ。 */
  shopSlug: string;
  portalSlug: string;
  /** キャスト投稿の場合の発行番号。店舗投稿(castIdがnull)なら常にnull。 */
  castIssueNo: number | null;
  area: string | null;
  address: string | null;
  genre: string | null;
  /** 投稿者が指定した任意のリンク先。未指定ならreelCtaUrl()が既定のリンク先を返す。 */
  linkUrl: string | null;
  /** 投稿日時(ISO文字列)。カード下部にさりげなく表示する。 */
  createdAt: string;
  /** falseの場合、このリールへの新規コメント・返信を受け付けない(既存コメントはRLS側で判定)。 */
  isCommentsEnabled: boolean;
};

/** システム管理者が投稿するPR(広告)。フィードに指定頻度で紛れ込ませる。 */
export type AdItem = {
  id: string;
  title: string;
  media: { type: "video" | "image"; url: string; poster?: string | null };
  /** タップ・クリック時の飛び先。管理者が任意に設定する。 */
  linkUrl: string;
  /** リールを何件表示するごとに1回挟むか。 */
  frequency: number;
};

export type ShopGridItem = {
  id: string;
  name: string;
  slug: string;
  portalSlug: string;
  area: string | null;
  address: string | null;
  genre: string | null;
  coverImageUrl: string | null;
  /** cover がGoogle Places写真のときだけ入る撮影者クレジット(表示必須)。 */
  coverAttribution?: { name?: string; uri?: string | null } | null;
};
