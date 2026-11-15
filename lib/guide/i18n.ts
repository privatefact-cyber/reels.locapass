import type { Locale } from "@/lib/i18n/locale";
import { localeUrl } from "@/lib/i18n/localePath";
import type { GuideArticle, GuideSection } from "./types";

/** ガイドを訳してある言語。中国語・アラビア語は未対応(日本語を出し、検索には出さない)。 */
export type GuideLocale = "ja" | "en";
export const GUIDE_LOCALES: GuideLocale[] = ["ja", "en"];

export function guideLocaleOf(locale: Locale): GuideLocale {
  return locale === "en" ? "en" : "ja";
}

/** 記事の、言語ごとに変わる部分。sections の構造(段落・項目の数)は日本語版と同じにする。 */
export type GuideText = {
  title: string;
  description: string;
  lead: string;
  sections: GuideSection[];
  faq?: { q: string; a: string }[];
};

function sameShape(a: GuideSection[], b: GuideSection[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (s, i) =>
        (s.paragraphs?.length ?? 0) === (b[i].paragraphs?.length ?? 0) &&
        (s.list?.length ?? 0) === (b[i].list?.length ?? 0) &&
        (s.steps?.length ?? 0) === (b[i].steps?.length ?? 0),
    )
  );
}

/** 日本語の記事に、訳した本文を重ねる。訳が無い・構造が合わないときは日本語のまま返す。 */
export function localizeArticle(
  article: GuideArticle,
  locale: GuideLocale,
  translations: Record<string, Record<string, GuideText>>,
): GuideArticle {
  if (locale === "ja") return article;
  const t = translations[locale]?.[article.slug];
  if (!t || !sameShape(article.sections, t.sections)) return article;
  return { ...article, title: t.title, description: t.description, lead: t.lead, sections: t.sections, faq: t.faq ?? article.faq };
}

/** その言語の訳がある(日本語は常にある)。訳が無い言語のURLは、検索に出さず、サイトマップにも載せない。 */
export function hasGuideTranslation(
  article: GuideArticle,
  locale: GuideLocale,
  translations: Record<string, Record<string, GuideText>>,
): boolean {
  if (locale === "ja") return true;
  const t = translations[locale]?.[article.slug];
  return !!t && sameShape(article.sections, t.sections);
}

/** そのガイドページの言語別URL。available を渡すと、訳がある言語だけを hreflang に載せる。 */
export function guideAlternates(path: string, locale: GuideLocale, available: GuideLocale[] = GUIDE_LOCALES) {
  const languages: Record<string, string> = {};
  for (const l of available) languages[l] = localeUrl(path, l);
  languages["x-default"] = localeUrl(path, "ja");
  return { canonical: localeUrl(path, locale), languages };
}

type Ui = {
  htmlLang: string;
  indexTitle: string;
  indexDescription: string;
  indexH1: string;
  indexLead: string;
  audience: Record<"visitor", string>;
  home: string;
  guide: string;
  breadcrumb: string;
  editor: string;
  published: string;
  updated: string;
  toc: string;
  faq: string;
  findShops: string;
  related: string;
  disclaimer: string;
};

export const GUIDE_UI: Record<GuideLocale, Ui> = {
  ja: {
    htmlLang: "ja",
    indexTitle: "訪日客のための日本のお店ガイド|カフェ・外食・ペット同伴",
    indexDescription: "日本のカフェや飲食店を訪れる訪日客向けに、支払い・チップ・予約・マナーなどの基本を解説するLOCAPASSのガイドです。",
    indexH1: "訪日客のための日本のお店ガイド",
    indexLead: "カフェや飲食店の使い方、支払い、予約、ペット同伴のマナーなど、初めての訪日客が迷いやすいことをまとめました。",
    audience: { visitor: "訪日の方へ" },
    home: "ホーム",
    guide: "ガイド",
    breadcrumb: "パンくずリスト",
    editor: "LOCAPASS編集部",
    published: "公開",
    updated: "更新",
    toc: "この記事の内容",
    faq: "よくある質問",
    findShops: "LOCAPASSでお店を探す",
    related: "あわせて読みたい",
    disclaimer: "この記事は一般的な情報をまとめたものです。営業時間・料金・条件は、お店ごとに異なります。最新の情報は、各お店のページでご確認ください。",
  },
  en: {
    htmlLang: "en",
    indexTitle: "Guide to Local Cafés and Restaurants in Japan for Visitors",
    indexDescription: "LOCAPASS guides for visitors to Japan: payment, tipping, reservations, etiquette and how to find cafés, restaurants and pet-friendly places.",
    indexH1: "Guide to Local Cafés and Restaurants in Japan for Visitors",
    indexLead: "The things first-time visitors often find confusing: how cafés and restaurants work, payment, reservations and pet-friendly etiquette.",
    audience: { visitor: "For visitors" },
    home: "Home",
    guide: "Guide",
    breadcrumb: "Breadcrumb",
    editor: "LOCAPASS Editorial Team",
    published: "Published",
    updated: "Updated",
    toc: "In this article",
    faq: "FAQ",
    findShops: "Find places on LOCAPASS",
    related: "Related articles",
    disclaimer: "This article summarizes general information. Opening hours, prices and conditions differ from place to place. Please check each place's page for the latest information.",
  },
};
