/** @type {import('next').NextConfig} */
const nextConfig = {
  // 募集LP(public/lp/*.html)を拡張子なしの短いURLで公開する。
  // 掲載店向けと代理店向けは意図的に別URL・相互リンクなし。
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
