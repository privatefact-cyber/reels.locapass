// 代理店の直近12か月の手数料の合計が、この額を超えたら、画面で「区分と契約の見直しの目安」を出す。
// 消費税の課税事業者になる目安(課税売上1,000万円)の手前で気づくための数字。本人のほかの収入は含まれないので、あくまで目安。
export const ANNUAL_REVIEW_THRESHOLD = 8_000_000;

export const AGENCY_KINDS = {
  corporate: "法人の代理店",
  sole_proprietor: "個人事業主の代理店",
  referrer: "紹介者(案件を紹介しただけの個人)",
} as const;
export type AgencyKind = keyof typeof AGENCY_KINDS;
