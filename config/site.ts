export const siteConfig = {
  name: process.env.NEXT_PUBLIC_PORTAL_NAME ?? "LOCAPASS",
  // locapass_sites.id (例: 水戸まちあるきポータル = 1)
  targetSiteId: Number(process.env.NEXT_PUBLIC_PORTAL_AREA ?? "1"),
  map: {
    initialCenter: {
      lat: 36.3659,
      lng: 140.4712,
    },
    initialZoom: 15,
  },
} as const;
