/**
 * ガイド記事(/guide)の型。記事の中身は lib/guide/content/ にある(コードで管理するので、DBの変更は要らない)。
 * 書くときの決まり:
 *  - 事実として確かな一般的な内容だけ。具体的な金額は書かない(お店ごとに違うため)。
 *  - 法律・制度・営業の形は、断定しすぎず「一般に」「お店により異なります」を添える。
 */
export type GuideSection = {
  heading: string;
  paragraphs?: string[];
  /** 箇条書き(番号なし)。 */
  list?: string[];
  /** 手順など、順番のある箇条書き。 */
  steps?: string[];
};

export type GuideAudience = "visitor";

export type GuideArticle = {
  slug: string;
  title: string;
  /** 検索結果に出る説明文(110文字前後)。 */
  description: string;
  audience: GuideAudience;
  /** 関連する業種(locapass_shops.category と同じ表記)。記事の下に、その業種の「地域×業種」ページへのリンクを出す。 */
  categories: string[];
  published: string;
  updated: string;
  /** 記事の冒頭の要約。 */
  lead: string;
  sections: GuideSection[];
  faq?: { q: string; a: string }[];
  /** 関連記事のslug。 */
  related: string[];
};
