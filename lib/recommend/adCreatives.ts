import { createStaticClient } from "@/lib/supabase/static";
import { pickTranslation } from "@/lib/i18n/contentTranslation";

/**
 * 広告枠に流すカード。管理画面(/admin/ad-cards)で登録したもの(locapass_ad_cards)を読む。無料掲載の店舗ページだけで使う。
 *  - 上の枠(mid)    : 有効なカードを並び順に、横スライドで並べる。
 *  - 下の枠(bottom) : 1枚の横長バナー。店舗・時間ごとに安定して入れ替わる(同じ人が同じ時間にリロードしても変わらない)。
 * 取得に失敗したときは、何も出さない(ページ本体の表示には影響しない)。
 */
export type AdCreative = {
  /** 表示・タップの記録に使う識別子(例: ad:<カードのid>)。 */
  id: string;
  label: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
  imageUrl?: string | null;
};

export type AdContext = { shopId: string; locale: string; now?: number };

type Row = {
  id: string;
  label: string;
  headline: string;
  body: string | null;
  cta: string;
  link_url: string;
  image_url: string | null;
  placement: "mid" | "bottom" | "both";
  starts_at: string | null;
  ends_at: string | null;
  translations: unknown;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toCreative(r: Row, locale: string): AdCreative {
  const loc = (["ja", "en", "zh", "ar"] as const).includes(locale as "ja") ? (locale as "ja" | "en" | "zh" | "ar") : "en";
  const t = (value: string | null, key: string) => pickTranslation(loc, value, r.translations, key).text ?? value ?? "";
  return {
    id: `ad:${r.id}`,
    label: t(r.label, "label"),
    title: t(r.headline, "headline"),
    sub: t(r.body, "body"),
    cta: t(r.cta, "cta"),
    href: r.link_url,
    imageUrl: r.image_url,
  };
}

async function activeCards(now: number): Promise<Row[]> {
  try {
    const { data, error } = await (createStaticClient() as any)
      .from("locapass_ad_cards")
      .select("id, label, headline, body, cta, link_url, image_url, placement, starts_at, ends_at, translations")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(20);
    if (error || !data) return [];
    return (data as Row[]).filter((r) => (!r.starts_at || Date.parse(r.starts_at) <= now) && (!r.ends_at || Date.parse(r.ends_at) > now));
  } catch {
    return [];
  }
}

export async function getAdCreatives(ctx: AdContext): Promise<{ mid: AdCreative[]; bottom: AdCreative | null }> {
  const now = ctx.now ?? Date.now();
  const rows = await activeCards(now);
  const mid = rows.filter((r) => r.placement !== "bottom").map((r) => toCreative(r, ctx.locale));
  const bottomRows = rows.filter((r) => r.placement !== "mid");
  const bucket = Math.floor(now / 3_600_000);
  const bottomRow = bottomRows.length ? bottomRows[hash(`${ctx.shopId}|bottom|${bucket}`) % bottomRows.length] : null;
  return { mid, bottom: bottomRow ? toCreative(bottomRow, ctx.locale) : null };
}
