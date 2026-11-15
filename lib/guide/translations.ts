import type { GuideText } from "./i18n";
import { EN_VISITORS } from "./content/en-visitors";

/** 言語 → 記事slug → 訳した本文。日本語は lib/guide/content/ の原本。 */
export const GUIDE_TRANSLATIONS: Record<string, Record<string, GuideText>> = {
  en: { ...EN_VISITORS },
};
