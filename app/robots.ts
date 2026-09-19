import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/dashboard",
        "/dashboard/",
        "/mypage",
        "/mypage/",
        "/cast/mypage",
        "/staff/mypage",
        "/login",
        "/cast/login",
        "/staff/login",
        "/admin/login",
        "/api/",
      ],
    },
    sitemap: "https://reels.locapass.net/sitemap.xml",
  };
}
