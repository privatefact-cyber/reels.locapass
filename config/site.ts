export const siteConfig = {
  name: process.env.NEXT_PUBLIC_PORTAL_NAME ?? "LOCAPASS",
  map: {
    // 現在地が取れない(拒否・失敗)ときの地図の中心。現在地が取れれば現在地に寄る。銀座四丁目交差点。
    initialCenter: {
      lat: 35.6717,
      lng: 139.7650,
    },
    initialZoom: 15,
  },
} as const;
