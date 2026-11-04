/** @type {import('next').NextConfig} */
const nextConfig = {
  // 募集LP(public/lp/*.html)を拡張子なしの短いURLで公開する。
  // 掲載店向けと代理店向けは意図的に別URL・相互リンクなし。
  // 地図は全国で1系統(/map)。旧ポータル地図 /{ポータル}/{エリア}/map は、そのポータルの初期設定で開く全国地図へ恒久的に転送する。
  // ページ内の permanentRedirect だと、レイアウトの描画が始まった後なので 200+meta refresh になってしまうため、ここで308を返す。
  // ポータル以外の固定ルート(/admin/… など)と、ポータル配下の固定ルート(/{ポータル}/shops/… など)は対象外。
  async redirects() {
    const topRoutes = "admin|api|auth|boost|c|cast|dashboard|embed|events|gate|inquiries|journal|legal|login|lp|map|mypage|notifications|photo|privacy|reel|reserve|s|shop-recover|shops|staff|support|terms";
    const portalRoutes = "boost|cast|events|shops|staff";
    return [
      {
        source: `/:portal((?!(?:${topRoutes})/)[^/]+)/:city((?!(?:${portalRoutes})/)[^/]+)/map`,
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
