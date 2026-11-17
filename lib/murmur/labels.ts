type Labels = {
  shopTitle: string;
  seeAll: string;
  timelineTitle: string;
  timelineLead: string;
  archiveTitle: (shop: string) => string;
  empty: string;
  prev: string;
  next: string;
  backToShop: string;
  backToPortal: string;
  timelineLink: string;
};

const ja: Labels = {
  shopTitle: "お店のひとこと",
  seeAll: "過去のひとことを見る",
  timelineTitle: "みんなのひとこと",
  timelineLead: "お店からの、いまのひとこと",
  archiveTitle: (s) => `${s}のひとこと`,
  empty: "まだひとことはありません。",
  prev: "前へ",
  next: "次へ",
  backToShop: "お店のページへ",
  backToPortal: "トップへ",
  timelineLink: "みんなのひとこと",
};
const en: Labels = {
  shopTitle: "Latest from the shop",
  seeAll: "See past posts",
  timelineTitle: "Shop updates",
  timelineLead: "Quick notes from shops, right now",
  archiveTitle: (s) => `${s} – updates`,
  empty: "No posts yet.",
  prev: "Previous",
  next: "Next",
  backToShop: "Back to the shop",
  backToPortal: "Back to top",
  timelineLink: "Shop updates",
};
const zh: Labels = {
  shopTitle: "店铺的一句话",
  seeAll: "查看过往动态",
  timelineTitle: "大家的一句话",
  timelineLead: "来自各店铺的最新动态",
  archiveTitle: (s) => `${s}的一句话`,
  empty: "还没有动态。",
  prev: "上一页",
  next: "下一页",
  backToShop: "返回店铺页面",
  backToPortal: "返回首页",
  timelineLink: "大家的一句话",
};
const ar: Labels = {
  shopTitle: "آخر ما نشره المتجر",
  seeAll: "عرض المنشورات السابقة",
  timelineTitle: "منشورات المتاجر",
  timelineLead: "ملاحظات سريعة من المتاجر الآن",
  archiveTitle: (s) => `منشورات ${s}`,
  empty: "لا توجد منشورات بعد.",
  prev: "السابق",
  next: "التالي",
  backToShop: "العودة إلى صفحة المتجر",
  backToPortal: "العودة إلى الرئيسية",
  timelineLink: "منشورات المتاجر",
};

const TABLE: Record<string, Labels> = { ja, en, zh, ar };

/** 言語ごとの表示文言。未対応の言語は英語にする(投稿の本文は、書かれた言葉のまま出す)。 */
export function murmurLabels(locale: string): Labels {
  return TABLE[locale] ?? en;
}

/** 「3時間前」のような相対表示。 */
export function murmurRelativeTime(iso: string, locale: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale === "zh" ? "zh-CN" : locale, { numeric: "auto" });
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso));
}
