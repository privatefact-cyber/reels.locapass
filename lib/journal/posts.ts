/**
 * LOCAPASS Journal(/journal)の記事。日本語のみ。読んでもらうための読み物なので、説明書ではなく、
 * 写真つきで、話しかけるような文体で書く(基本的なサポートはヘルプとAIが受け持つ)。
 *   topics … 新機能・お知らせ・開発のこぼれ話
 *   tips   … ちょっとしたコツ
 * 記事を足すときは、この配列に追加する(並びは日付の新しい順に自動で整える)。
 * 写真は public/journal/ に置いて cover / image ブロックで指定する(無い記事は、表紙が自動で飾りになる)。
 * 裏側の仕組みや利用している外部サービス名は、記事には書かない(機能の話だけを書く)。
 */
export type JournalCategory = "tips" | "topics";

export type JournalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "image"; src: string; alt: string; caption?: string };

export type JournalPost = {
  slug: string;
  category: JournalCategory;
  /** 公開日(JST)。YYYY-MM-DD */
  date: string;
  title: string;
  /** 一覧・検索結果に出す1〜2文の要約 */
  description: string;
  /** 記事の冒頭に大きく出す、導入の一文 */
  lead?: string;
  /** 表紙の写真(public/ 以下のパス)。無ければ飾りの表紙になる */
  cover?: { src: string; alt: string };
  body: JournalBlock[];
};

export const JOURNAL_CATEGORY_LABELS: Record<JournalCategory, string> = {
  topics: "新機能・お知らせ",
  tips: "ちょっとしたコツ",
};

const POSTS: JournalPost[] = [
  {
    slug: "post-photo-video-to-this-shop",
    category: "topics",
    date: "2026-10-28",
    title: "おいしかった一皿を、そのお店のページに。写真・動画の投稿が、もっと気軽になりました",
    description:
      "お店のページの「このお店の写真・動画を投稿」から、そのお店にそのまま載せられるようになりました。帰ってからの投稿もOKです。",
    lead: "「この一皿、あのお店のページに載せたいな」。そんな気持ちを、ひと手間でかなえられるようにしました。",
    cover: { src: "/journal/dish.jpg", alt: "和食の定食" },
    body: [
      { type: "h2", text: "お店のページから、そのまま投稿" },
      {
        type: "p",
        text: "お店のページを開くと、「＋ このお店の写真・動画を投稿」というボタンがあります。ここから投稿した写真や動画は、必ずそのお店のページ(LOCA SNAP)に並びます。",
      },
      {
        type: "p",
        text: "場所を入れたり、近くのお店の候補から選んだりする手間はありません。写真か動画を選んで、ひとことを添えるだけ。ひとことが思いつかないときは、AIにおまかせもできます。",
      },
      { type: "h2", text: "帰ってから、ゆっくり載せてもOK" },
      {
        type: "image",
        src: "/journal/udon.jpg",
        alt: "湯気のたつうどん",
        caption: "写真はイメージです",
      },
      {
        type: "p",
        text: "お店を出たあと、家でゆっくり「やっぱり載せようかな」と思うこと、ありますよね。お店のページから投稿すれば、写真に位置情報が入っていなくても大丈夫。ピンは、ちゃんとそのお店に立ちます。口コミを書くような気持ちで、気軽に使ってみてください。",
      },
      { type: "h2", text: "街の景色や穴場は、これまでどおり" },
      {
        type: "p",
        text: "お店とは関係のない、街の景色や見つけた穴場は、スナップの投稿画面から。こちらは、撮った場所にピンが立ちます。",
      },
      {
        type: "p",
        text: "動画は30秒・50MBまで。まだ写真が1枚もないお店にも、投稿の入口が出ています。ぜひ、最初の1枚を載せてみてください。",
      },
    ],
  },
  {
    slug: "snap-check-and-fix-address",
    category: "tips",
    date: "2026-10-28",
    title: "写真の場所がちがっていたら? 住所は、その場で直せます",
    description:
      "スナップ投稿では、写真の位置情報から住所が自動で入ります。ずれていても、書き換えてすぐ直せます。位置情報のない写真の載せ方もご紹介します。",
    lead: "地図にピンが立つのが、スナップの楽しいところ。場所がずれていたときの直し方を、サクッとまとめました。",
    cover: { src: "/journal/street.jpg", alt: "夜の街の看板" },
    body: [
      { type: "h2", text: "住所は、自動で入ります" },
      {
        type: "p",
        text: "写真や動画に位置情報が入っていれば、それを読み取って、撮った場所の住所が「撮影場所の住所」の欄に自動で入ります。近くのお店やスポットも、候補として出てきます。",
      },
      { type: "h2", text: "ずれていたら、書き換えて「位置を確認」" },
      {
        type: "ul",
        items: [
          "合っていれば、そのまま投稿できます。",
          "ちがっていたら、住所を書き換えて「位置を確認」を押してください。ピンの位置と、近くの候補が新しくなります。",
          "押し忘れても大丈夫。投稿するときに、書き換えた住所から場所を取り直します。",
        ],
      },
      { type: "h2", text: "位置情報のない写真は?" },
      {
        type: "p",
        text: "住所や地名を入れて「位置を確認」を押せば、投稿できます。場所が決まらないとピンが立てられないので、投稿ボタンは、場所が決まるまでお待ちください。",
      },
      { type: "h2", text: "見つからないときのコツ" },
      {
        type: "p",
        text: "「東京都渋谷区神宮前5-3-12」のように、都道府県から番地まで書くと、見つかりやすくなります。",
      },
      {
        type: "p",
        text: "もし、特定のお店の写真として載せたいときは、そのお店のページの「このお店の写真・動画を投稿」から。場所の入力は、いりません。",
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
