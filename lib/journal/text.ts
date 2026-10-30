import type { Locale } from "@/lib/i18n/locale";
import type { JournalCategory } from "@/lib/journal/posts";

/** Journalの画面まわりの固定文言(記事の中身ではない部分)。記事そのものは自動翻訳で言語が変わる。 */
type JournalText = {
  tagline: string;
  description: string;
  categoryLabels: Record<JournalCategory, string>;
  all: string;
  archive: string;
  allMonths: string;
  noPosts: string;
  more: string;
  untitled: string;
  defaultLinkLabel: string;
  photo: string;
  categoryNav: string;
  archiveNav: string;
  count: (n: number) => string;
  month: (year: number, month: number) => string;
  date: (year: number, month: number, day: number) => string;
};

const TEXT: Record<Locale, JournalText> = {
  ja: {
    tagline: "街とお店の、ちょっといい話。",
    description: "街とお店のちょっといい話。新しくできたことや、使い方のコツを、写真といっしょにお届けします。",
    categoryLabels: { topics: "新機能・お知らせ", tips: "ちょっとしたコツ" },
    all: "すべて",
    archive: "ARCHIVE",
    allMonths: "すべての月",
    noPosts: "記事はまだありません。",
    more: "ほかの記事も読んでみる",
    untitled: "(タイトル)",
    defaultLinkLabel: "詳しくはこちら",
    photo: "写真",
    categoryNav: "カテゴリ",
    archiveNav: "月別アーカイブ",
    count: (n) => `${n}件`,
    month: (y, m) => `${y}年${m}月`,
    date: (y, m, d) => `${y}年${m}月${d}日`,
  },
  en: {
    tagline: "Little stories about the town and its shops.",
    description: "Little stories about the town and its shops: what's new, and tips for getting the most out of LOCAPASS, with photos.",
    categoryLabels: { topics: "News & updates", tips: "Tips" },
    all: "All",
    archive: "ARCHIVE",
    allMonths: "All months",
    noPosts: "No articles yet.",
    more: "More articles",
    untitled: "(Untitled)",
    defaultLinkLabel: "Learn more",
    photo: "Photo",
    categoryNav: "Categories",
    archiveNav: "Monthly archive",
    count: (n) => `${n} ${n === 1 ? "article" : "articles"}`,
    month: (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" }),
    date: (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  },
  zh: {
    tagline: "关于街区和店铺的小故事。",
    description: "关于街区和店铺的小故事。为您带来新功能、使用小窍门,并附上照片。",
    categoryLabels: { topics: "新功能・公告", tips: "小窍门" },
    all: "全部",
    archive: "归档",
    allMonths: "所有月份",
    noPosts: "暂无文章。",
    more: "更多文章",
    untitled: "(无标题)",
    defaultLinkLabel: "了解更多",
    photo: "照片",
    categoryNav: "分类",
    archiveNav: "按月归档",
    count: (n) => `${n}篇`,
    month: (y, m) => `${y}年${m}月`,
    date: (y, m, d) => `${y}年${m}月${d}日`,
  },
  ar: {
    tagline: "حكايات صغيرة عن المدينة ومتاجرها.",
    description: "حكايات صغيرة عن المدينة ومتاجرها: ما الجديد ونصائح للاستفادة من LOCAPASS، مع الصور.",
    categoryLabels: { topics: "الجديد والإعلانات", tips: "نصائح" },
    all: "الكل",
    archive: "الأرشيف",
    allMonths: "كل الأشهر",
    noPosts: "لا توجد مقالات بعد.",
    more: "مقالات أخرى",
    untitled: "(بدون عنوان)",
    defaultLinkLabel: "اعرف المزيد",
    photo: "صورة",
    categoryNav: "الفئات",
    archiveNav: "الأرشيف الشهري",
    count: (n) => `${n}`,
    month: (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", timeZone: "UTC" }),
    date: (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  },
};

export function journalText(locale: Locale): JournalText {
  return TEXT[locale] ?? TEXT.ja;
}

/** "2026-10-30" を表示言語の日付表記にする。 */
export function formatJournalDateFor(date: string, locale: Locale): string {
  const [y, m, d] = date.split("-").map(Number);
  return journalText(locale).date(y, m, d);
}
