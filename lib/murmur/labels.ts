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
  seeMore: string;
};

const ja: Labels = {
  shopTitle: "お店のVOICE",
  seeAll: "過去のVOICEを見る",
  timelineTitle: "VOICE",
  timelineLead: "ふらっとつぶやく100文字のひとりごと",
  archiveTitle: (s) => `${s}のVOICE`,
  empty: "まだVOICEはありません。",
  prev: "前へ",
  next: "次へ",
  backToShop: "お店のページへ",
  backToPortal: "トップへ",
  timelineLink: "VOICE",
  seeMore: "もっと見る",
};
const en: Labels = {
  shopTitle: "Shop VOICE",
  seeAll: "See past VOICE",
  timelineTitle: "VOICE",
  timelineLead: "Casual 100-character musings, just thinking out loud",
  archiveTitle: (s) => `${s} – VOICE`,
  empty: "No VOICE yet.",
  prev: "Previous",
  next: "Next",
  backToShop: "Back to the shop",
  backToPortal: "Back to top",
  timelineLink: "VOICE",
  seeMore: "See more",
};
const zh: Labels = {
  shopTitle: "店铺的VOICE",
  seeAll: "查看过往VOICE",
  timelineTitle: "VOICE",
  timelineLead: "随口一说的100字自言自语",
  archiveTitle: (s) => `${s}的VOICE`,
  empty: "还没有VOICE。",
  prev: "上一页",
  next: "下一页",
  backToShop: "返回店铺页面",
  backToPortal: "返回首页",
  timelineLink: "VOICE",
  seeMore: "查看更多",
};
const ar: Labels = {
  shopTitle: "VOICE المتجر",
  seeAll: "عرض VOICE السابقة",
  timelineTitle: "VOICE",
  timelineLead: "تغريدات عفوية من 100 حرف، كحديث مع النفس",
  archiveTitle: (s) => `VOICE ${s}`,
  empty: "لا يوجد VOICE بعد.",
  prev: "السابق",
  next: "التالي",
  backToShop: "العودة إلى صفحة المتجر",
  backToPortal: "العودة إلى الرئيسية",
  timelineLink: "VOICE",
  seeMore: "عرض المزيد",
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
