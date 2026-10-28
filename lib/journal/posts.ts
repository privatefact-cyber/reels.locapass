/**
 * LOCAPASS Journal(/journal)の記事。日本語のみ。
 *   topics … お知らせ・アップデート・開発日誌(「こんな機能が入りました」「なぜこう作ったか」)
 *   tips   … 使い方のコツ
 * 記事を足すときは、この配列の先頭に追加する(並びは日付の新しい順に自動で整える)。
 * 裏側の仕組みや利用している外部サービス名は、記事には書かない(機能の話だけを書く)。
 */
export type JournalCategory = "tips" | "topics";

export type JournalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "note"; text: string };

export type JournalPost = {
  slug: string;
  category: JournalCategory;
  /** 公開日(JST)。YYYY-MM-DD */
  date: string;
  title: string;
  /** 一覧・検索結果に出す1〜2文の要約 */
  description: string;
  body: JournalBlock[];
};

export const JOURNAL_CATEGORY_LABELS: Record<JournalCategory, string> = {
  topics: "Topics",
  tips: "Tips",
};

export const JOURNAL_CATEGORY_NOTES: Record<JournalCategory, string> = {
  topics: "お知らせ・アップデート・開発日誌",
  tips: "使い方のコツ",
};

const POSTS: JournalPost[] = [
  {
    slug: "post-photo-video-to-this-shop",
    category: "topics",
    date: "2026-10-28",
    title: "お店のページから、そのお店の写真・動画を投稿できるようになりました",
    description:
      "お店のページの「このお店の写真・動画を投稿」から投稿すると、必ずそのお店のページに載ります。位置情報のない写真でも、帰宅後の投稿でも大丈夫です。",
    body: [
      {
        type: "p",
        text: "お店のページに、「＋ このお店の写真・動画を投稿」ボタンを用意しました。このボタンから投稿すると、写真や動画は必ずそのお店に紐づき、お店のページの「LOCA SNAP」に並びます。",
      },
      { type: "h2", text: "こんなときに使えます" },
      {
        type: "ul",
        items: [
          "お店で料理を撮って、そのままそのお店の写真として載せたいとき",
          "家に帰ってから、口コミのように写真を載せたいとき(写真に位置情報がなくても大丈夫です)",
        ],
      },
      { type: "h2", text: "いつもの投稿より、入力が少ないです" },
      {
        type: "p",
        text: "ピンの位置と住所は、そのお店の登録情報が自動で使われます。場所名の入力や、近くのお店の候補を選ぶ手間もありません。写真・動画を選んで、ひとことを書くだけで投稿できます(ひとことはAIにおまかせ生成もできます)。動画は30秒・50MBまでです。",
      },
      {
        type: "p",
        text: "投稿したあとは、そのお店の写真一覧のページに戻ります。まだ写真が1枚もないお店でも、お店のページに投稿の入口が出ます。",
      },
      { type: "h2", text: "お店と関係のない場所の写真は?" },
      {
        type: "p",
        text: "街で見つけた景色や、穴場スポットなど、特定のお店に紐づけない写真・動画は、これまでどおり、スナップの投稿画面から投稿できます。",
      },
      {
        type: "note",
        text: "お店のページから投稿した写真は、位置がそのお店に固定されます。お店とは別の場所で撮った写真を載せたいときは、スナップの投稿画面をお使いください。",
      },
    ],
  },
  {
    slug: "snap-check-and-fix-address",
    category: "tips",
    date: "2026-10-28",
    title: "スナップ投稿のコツ:位置情報の住所を確認して、直す方法",
    description:
      "写真・動画の投稿では、撮影した場所の住所が自動で入ります。違っていたらその場で直せます。位置情報のない写真の投稿方法もまとめました。",
    body: [
      {
        type: "p",
        text: "スナップの投稿は、場所が決まるとマップにピンが立ちます。そのため、投稿には場所(位置)が必要です。ここでは、その決め方と直し方を紹介します。",
      },
      { type: "h2", text: "位置情報のある写真・動画のとき" },
      {
        type: "p",
        text: "写真や動画に位置情報が入っていれば、自動で検出して、撮影した場所の住所を「撮影場所の住所」の欄に入れます。近くの掲載店やスポットが、候補として表示されます。",
      },
      {
        type: "ul",
        items: [
          "住所が合っていれば、そのまま投稿できます。",
          "違っていたら、住所を直して「位置を確認」を押してください。ピンの位置と候補が更新されます。",
          "押し忘れても、投稿するときに、直した住所から位置を取り直します。",
        ],
      },
      { type: "h2", text: "位置情報のない写真・動画のとき" },
      {
        type: "p",
        text: "住所や地名を入力して「位置を確認」を押してください。位置が決まると、投稿できるようになります。位置が決まらないと、ピンが立てられないので、投稿ボタンは押せません。",
      },
      {
        type: "note",
        text: "住所から位置が見つからないときは、「東京都渋谷区神宮前5-3-12」のように、都道府県から番地まで書くと見つかりやすくなります。",
      },
      { type: "h2", text: "お店の写真として載せたいとき" },
      {
        type: "p",
        text: "そのお店のページにある「このお店の写真・動画を投稿」から投稿すると、位置の入力は要りません。お店に紐づけたいときは、こちらがおすすめです。",
      },
    ],
  },
];

export const JOURNAL_POSTS: JournalPost[] = [...POSTS].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((p) => p.slug === slug);
}

export function formatJournalDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}
