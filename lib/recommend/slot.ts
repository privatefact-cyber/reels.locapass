/**
 * 「近くのおすすめ」枠の出し分け。
 *
 * 無料(free)と低価格の簡易版(lite)の店舗ページに出し、通常版以上の店舗ページには出さない(通常版の特典)。
 * 出し分けは plan の値で決める。「有料」(isPaidPlan = free 以外)は、他店ページでの優先掲載(PR)の判定に使う。
 * plan は運営だけが書き換えられる(DBのトリガーで保護)ので、店舗側からは変えられない。
 * 出し分けの判断はここ1か所に集める(店舗ページと、店主の管理画面のプレビューが同じ関数を使う)。
 */

/** おすすめ枠・広告枠を出すプラン。無料(free)と低価格の簡易版(lite)。通常版(standard など)には出さない。 */
export const PLANS_WITH_PROMO_SLOT: readonly string[] = ["free", "lite"];

/** 有料掲載の店舗か(plan が free でも未設定でもない)。簡易版も含む。他店ページでの優先掲載に使う。 */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return !!plan && plan !== "free";
}

/** この店舗のページに「近くのおすすめ」枠を出すか。無料・簡易版の店舗だけ true。 */
export function shopShowsPromoSlot(plan: string | null | undefined): boolean {
  return !plan || PLANS_WITH_PROMO_SLOT.includes(plan);
}
