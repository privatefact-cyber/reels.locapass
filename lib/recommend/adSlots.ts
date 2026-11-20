/**
 * 広告枠(外部広告・自社広告を将来入れる場所)の土台。
 *
 * いまは中身を入れず、場所の確認用のダミー表示だけを出せる。出し分けは次の3段で決まる。
 *  1. 有料掲載の店舗ページには出さない(lib/recommend/slot.ts の shopShowsPromoSlot。呼び出し側で判定する)。
 *  2. 環境変数 AD_SLOT_MODE=placeholder のときだけダミーを出す。未設定の本番は off(何も出ない)。開発環境(production以外)は既定で placeholder。
 *  3. URLに ?ad_preview=1 を付けると、本番でもその1回だけダミーを出して場所を確認できる(お客様には出ない)。
 *
 * 広告の中身(広告タグ・アフィリエイトのリンクなど)を入れるときは、ShopAdSlot の中身を差し替える。
 * 場所(position)と、枠の大きさ(レイアウトのずれを防ぐための確保)は、ここで決めたものを使う。
 */

/** mid = 基本情報のすぐ下 / bottom = ページ最下部(おすすめ枠の下) */
export type AdSlotPosition = "mid" | "bottom";
/** off=出さない / placeholder=場所確認用のダミー / live=自社の中身(告知・編集枠)を出して表示・タップを記録する */
export type AdSlotMode = "off" | "placeholder" | "live";

/** 枠ごとの大きさ。広告が読み込まれる前後でページが動かないよう、この高さを先に確保する。 */
export const AD_SLOT_SIZES: Record<AdSlotPosition, { width: number; height: number; label: string }> = {
  mid: { width: 300, height: 250, label: "レクタングル" },
  bottom: { width: 320, height: 100, label: "横長バナー" },
};

/** preview は URL の ?ad_preview= の値。"1"=ダミー / "live"=自社の中身。 */
export function adSlotMode(preview: string | undefined): AdSlotMode {
  if (preview === "live") return "live";
  if (preview === "1") return "placeholder";
  const env = process.env.AD_SLOT_MODE;
  if (env === "live") return "live";
  if (env === "placeholder") return "placeholder";
  if (env === "off") return "off";
  return process.env.NODE_ENV === "production" ? "off" : "placeholder";
}
