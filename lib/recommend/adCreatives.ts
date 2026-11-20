import { createStaticClient } from "@/lib/supabase/static";
import type { AdSlotPosition } from "@/lib/recommend/adSlots";

/**
 * 広告枠に流す自社の中身(いまは外部広告なし)。無料掲載の店舗ページだけで使う。
 *  - pet     : ロカわん(愛犬)の案内。ペット同伴可の店のページにだけ出す(関係のないページには出さない)。
 *  - plan    : 掲載店の方へ、有料掲載でこの枠が消えることの案内(無料と有料の差を伝える)。
 *  - journal : 編集枠。最新のジャーナル記事を紹介する。
 * どれを出すかは、店舗ごと・時間ごとに安定して入れ替わる(同じ人が同じ時間にリロードしても変わらない)。
 */
export type AdCreative = {
  id: string;
  label: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
  imageUrl?: string | null;
};
type L = "ja" | "en" | "zh" | "ar";
const pick = <T,>(m: Record<L, T>, locale: string): T => m[(["ja", "en", "zh", "ar"] as const).includes(locale as L) ? (locale as L) : "en"];

export type AdContext = { shopId: string; locale: string; petOk: boolean; now?: number };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function latestJournal(): Promise<{ slug: string; title: string; description: string | null; cover_url: string | null } | null> {
  try {
    const { data } = await (createStaticClient() as any)
      .from("locapass_journal_posts")
      .select("slug, title, description, cover_url")
      .eq("status", "published")
      .order("published_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function pickAdCreative(position: AdSlotPosition, ctx: AdContext): Promise<AdCreative | null> {
  const list: AdCreative[] = [];
  if (ctx.petOk) {
    list.push({
      id: "pet",
      label: pick({ ja: "PR", en: "Ad", zh: "广告", ar: "إعلان" }, ctx.locale),
      title: pick({ ja: "ロカわん — 愛犬とおでかけ", en: "Locawan — outings with your dog", zh: "Locawan — 带爱犬出门", ar: "Locawan — نزهات مع كلبك" }, ctx.locale),
      sub: pick({ ja: "ペットと行けるお店・スポットを地図で探せます", en: "Find pet-friendly places on the map", zh: "在地图上找到可带宠物的地方", ar: "ابحث عن أماكن تقبل الحيوانات على الخريطة" }, ctx.locale),
      cta: pick({ ja: "ロカわんを見る", en: "See Locawan", zh: "查看 Locawan", ar: "عرض Locawan" }, ctx.locale),
      href: "/pet/app",
    });
  }
  list.push({
    id: "plan",
    label: pick({ ja: "お知らせ", en: "Notice", zh: "通知", ar: "إشعار" }, ctx.locale),
    title: pick({ ja: "掲載店の方へ", en: "For venue owners", zh: "致店家", ar: "لأصحاب المتاجر" }, ctx.locale),
    sub: pick({ ja: "有料掲載にすると、このページの広告枠とおすすめ枠が消え、他店ページで優先して紹介されます", en: "Upgrade to remove ads on this page and be featured first on other venues' pages", zh: "升级为付费后,本页的广告将消失,并优先出现在其他店铺页面", ar: "بالترقية تختفي الإعلانات من هذه الصفحة وتظهر متجرك أولاً في صفحات المتاجر الأخرى" }, ctx.locale),
    cta: pick({ ja: "プランを相談する", en: "Ask about plans", zh: "咨询方案", ar: "اسأل عن الباقات" }, ctx.locale),
    href: "/support",
  });
  const j = await latestJournal();
  if (j) {
    list.push({
      id: `journal:${j.slug}`.slice(0, 80),
      label: pick({ ja: "特集", en: "Feature", zh: "专题", ar: "مقال" }, ctx.locale),
      title: j.title,
      sub: j.description ?? "",
      cta: pick({ ja: "記事を読む", en: "Read", zh: "阅读", ar: "اقرأ" }, ctx.locale),
      href: `/journal/${j.slug}`,
      imageUrl: j.cover_url,
    });
  }
  if (list.length === 0) return null;
  const bucket = Math.floor((ctx.now ?? Date.now()) / 3_600_000);
  return list[hash(`${ctx.shopId}|${position}|${bucket}`) % list.length];
}
