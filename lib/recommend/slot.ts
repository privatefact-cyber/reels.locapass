/**
 * 「近くのおすすめ」枠の出し分け。
 *
 * 無料掲載の店舗ページにだけ出し、有料掲載の店舗ページには出さない(有料の特典)。
 * 有料かどうかは、予約機能(shopCanTakeReservations)と同じく plan が 'free' かどうかで決める。
 * plan は運営だけが書き換えられる(DBのトリガーで保護)ので、店舗側からは変えられない。
 * 出し分けの判断はここ1か所に集める(店舗ページと、店主の管理画面のプレビューが同じ関数を使う)。
 */

/** 有料掲載の店舗か(plan が free でも未設定でもない)。 */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return !!plan && plan !== "free";
}

/** この店舗のページに「近くのおすすめ」枠を出すか。無料掲載の店舗だけ true。 */
export function shopShowsPromoSlot(plan: string | null | undefined): boolean {
  return !isPaidPlan(plan);
}
