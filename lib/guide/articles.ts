import { VISITOR_ARTICLES } from "./content/visitors";
import type { GuideArticle, GuideAudience } from "./types";

export type { GuideArticle, GuideAudience };

/** 全記事(定義順)。 */
export const GUIDE_ARTICLES: GuideArticle[] = [...VISITOR_ARTICLES];

export function getGuideArticle(slug: string): GuideArticle | null {
  return GUIDE_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function relatedGuideArticles(article: GuideArticle): GuideArticle[] {
  return article.related.map((slug) => getGuideArticle(slug)).filter((a): a is GuideArticle => !!a);
}
