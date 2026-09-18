export const siteConfig = {
  name: process.env.NEXT_PUBLIC_PORTAL_NAME ?? "LOCAPASS",
  targetArea: process.env.NEXT_PUBLIC_PORTAL_AREA ?? "大工町",
  map: {
    initialCenter: {
      lat: 36.3659,
      lng: 140.4712,
    },
    initialZoom: 15,
  },
} as const;
