import { GUIDE_ARTICLES } from "@/lib/guide/articles";

// AIエージェント向けのサイト案内(llmstxt.org の推奨形式)。
//  - 1行目: # サイト名
//  - 直後: > サイトの簡潔な説明
//  - 以降: ## セクション名 の下に、- [ページ名](完全なURL): 説明 のリスト
// 店舗やリールは数が多く頻繁に変わるので、ここには載せない(全体は sitemap.xml)。
// 載せるのは、サイトの入口と、固定のページだけ。

const BASE = "https://locapass.net";

type Link = { title: string; path: string; note: string };

const SERVICE: Link[] = [
  { title: "トップ(リールで探す)", path: "/", note: "街のお店の30秒動画を、縦スワイプで見られるフィード。NOW(いま営業中)・SHOPなどで絞り込めます。" },
  { title: "マップで探す", path: "/map", note: "地図のピンから、近くのお店の動画カードを見られます。" },
  { title: "エリアから探す", path: "/areas", note: "地域ごとのお店・動画の一覧。" },
  { title: "写真(LOCAPASS SNAP)", path: "/photo", note: "利用者が投稿した、お店や街の写真ギャラリー。" },
  { title: "ジャーナル", path: "/journal", note: "新機能のお知らせや、お店の発信に役立つ記事。" },
];

const PETS: Link[] = [
  { title: "ロカわん(愛犬の手帳アプリ)", path: "/pet/app", note: "ワクチン証明などの記録、迷子さがし、おでかけ先探しができる、愛犬のための手帳アプリの紹介。" },
];

const SHOPS: Link[] = [
  { title: "掲載店舗の募集(店舗向けLP)", path: "/lp/shop", note: "30秒の動画で、お店の“いま”を届けるための掲載のご案内。スタッフの個人ページ「FACES」の紹介を含みます。" },
  { title: "緊急ブースト", path: "/boost", note: "ドタキャン・作りすぎなど、1〜3時間限定のお得情報。" },
];

const SUPPORT: Link[] = [
  { title: "サポート", path: "/support", note: "使い方のご質問・お問い合わせ。" },
  { title: "利用規約", path: "/terms", note: "サービスの利用条件。" },
  { title: "プライバシーポリシー", path: "/privacy", note: "個人情報の取り扱い。" },
  { title: "特定商取引法に基づく表記", path: "/legal", note: "事業者情報・取引条件の表記。" },
];

function section(heading: string, links: Link[]): string {
  const lines = links.map((l) => `- [${l.title}](${BASE}${l.path}): ${l.note}`);
  return `## ${heading}\n\n${lines.join("\n")}\n`;
}

export const dynamic = "force-static";

export function GET() {
  const guide: Link[] = GUIDE_ARTICLES.map((a) => ({
    title: a.title,
    path: `/guide/${a.slug}`,
    note: a.description.replace(/\s+/g, " ").trim(),
  }));

  const body = [
    "# LOCAPASS(ロカパス)",
    "",
    "> 街のカフェ・お店・ペットと行ける場所を、30秒の縦型ショート動画で探せる地域メディア。アプリ不要でスマホのブラウザからすぐ見られ、画面は日本語・英語・中国語・アラビア語に対応しています。",
    "",
    "店舗・リール(動画)・スタッフの個人ページは日々更新されます。全ページの一覧は [sitemap.xml](" + BASE + "/sitemap.xml) をご覧ください。",
    "",
    section("サービス", SERVICE),
    section("ペット", PETS),
    section("店舗向け", SHOPS),
    section("ガイド記事", guide),
    section("サポート・規約", SUPPORT),
    "## Optional",
    "",
    `- [sitemap.xml](${BASE}/sitemap.xml): 公開されている全ページ(店舗・リール・地域・ガイド記事)のURL一覧。`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
