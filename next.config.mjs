/** @type {import('next').NextConfig} */
const nextConfig = {
  // サーバーアクションで受け取れる大きさ。標準は1MBで、写真(3MBまで)のアップロードが「Body exceeded 1 MB limit」で失敗していた。
  // Vercelの関数の受け取り上限は約4.5MBなので、それを超えない4MBにする。
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // 募集LP(public/lp/*.html)を拡張子なしの短いURLで公開する。
  // 掲載店向けと代理店向けは意図的に別URL・相互リンクなし。
  // 地図は全国で1系統(/map)。旧ポータル地図 /{ポータル}/{エリア}/map は、そのポータルの初期設定で開く全国地図へ恒久的に転送する。
  // ページ内の permanentRedirect だと、レイアウトの描画が始まった後なので 200+meta refresh になってしまうため、ここで308を返す。
  // ポータル以外の固定ルート(/admin/… など)と、ポータル配下の固定ルート(/{ポータル}/shops/… など)は対象外。
  // 言語別URL(/en /zh /ar。lib/i18n/localePath.ts)の旧ポータル地図は、同じ言語の全国地図へ転送する。
  async redirects() {
    const localePrefixes = "en|zh|ar";
    const topRoutes = "admin|api|auth|boost|c|cast|dashboard|embed|events|gate|inquiries|journal|legal|login|lp|map|mypage|notifications|photo|privacy|reel|reserve|s|shop-recover|shops|staff|support|terms";
    const portalRoutes = "boost|cast|events|shops|staff";
    return [
      // ワンコ手帳: 以前の迷子のお知らせの共有URL(/pet/lost?report=ID)を、検索に出す個別ページへ恒久転送する
      {
        source: "/pet/lost",
        has: [{ type: "query", key: "report", value: "(?<report>[0-9a-fA-F-]{36})" }],
        destination: "/pet/lost/:report",
        permanent: true,
      },
      {
        source: `/:lang(${localePrefixes})/:portal((?!(?:${topRoutes})/)[^/]+)/:city((?!(?:${portalRoutes})/)[^/]+)/map`,
        destination: "/:lang/map?preset=:portal",
        permanent: true,
      },
      {
        source: `/:portal((?!(?:${topRoutes}|${localePrefixes})/)[^/]+)/:city((?!(?:${portalRoutes})/)[^/]+)/map`,
        destination: "/map?preset=:portal",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/lp/shop", destination: "/lp/shop.html" },
        { source: "/lp/agency", destination: "/lp/agency.html" },
      ],
    };
  },
};

export default nextConfig;
