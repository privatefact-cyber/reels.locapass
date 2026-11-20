import { createAdminClient } from "@/lib/supabase/admin";
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

/** 広告を出す側のページ(無料掲載の店舗)の情報。有料店のカードは、同じポータル(と、指定があれば同じ業種)のページにだけ出す。 */
export type AdContext = { shopId: string; locale: string; portalId?: number | null; category?: string | null; now?: number };

/** ADオプションで広告を出せるプラン(無料・簡易版は不可)。 */
const AD_ADVERTISER_EXCLUDED_PLANS = ["free", "lite"];

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
  shop_id: string | null;
  same_category_only: boolean;
  /** 広告主の店舗(運営のカードは null)。 */
  shop: { portal_id: number; category: string | null; plan: string; status: string; ad_option_enabled: boolean } | null;
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

async function activeCards(ctx: AdContext, now: number): Promise<Row[]> {
  try {
    // 広告主の店舗の状態(プラン・オプション)まで見るため、サーバー側の権限で読む。出すのは公開してよい項目だけ。
    const { data, error } = await (createAdminClient() as any)
      .from("locapass_ad_cards")
      .select(
        "id, label, headline, body, cta, link_url, image_url, placement, starts_at, ends_at, translations, shop_id, same_category_only, shop:locapass_shops ( portal_id, category, plan, status, ad_option_enabled )",
      )
      .eq("is_active", true)
      .eq("status", "approved")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(60);
    if (error || !data) return [];
    return (data as any[])
      .map((r) => ({ ...r, shop: Array.isArray(r.shop) ? (r.shop[0] ?? null) : r.shop }) as Row)
      .filter((r) => (!r.starts_at || Date.parse(r.starts_at) <= now) && (!r.ends_at || Date.parse(r.ends_at) > now))
      .filter((r) => {
        if (!r.shop_id) return true; // 運営のカードは全ページ
        const adv = r.shop;
        if (!adv || r.shop_id === ctx.shopId) return false; // 自分のページには出さない
        if (!adv.ad_option_enabled || adv.status !== "active" || AD_ADVERTISER_EXCLUDED_PLANS.includes(adv.plan)) return false;
        if (ctx.portalId == null || adv.portal_id !== ctx.portalId) return false; // 同じポータルだけ
        if (r.same_category_only && (!adv.category || adv.category !== (ctx.category ?? null))) return false;
        return true;
      });
  } catch {
    return [];
  }
}

export async function getAdCreatives(ctx: AdContext): Promise<{ mid: AdCreative[]; bottom: AdCreative | null }> {
  const now = ctx.now ?? Date.now();
  const rows = await activeCards(ctx, now);
  const mid = rows.filter((r) => r.placement !== "bottom").map((r) => toCreative(r, ctx.locale));
  const bottomRows = rows.filter((r) => r.placement !== "mid");
  const bucket = Math.floor(now / 3_600_000);
  const bottomRow = bottomRows.length ? bottomRows[hash(`${ctx.shopId}|bottom|${bucket}`) % bottomRows.length] : null;
  return { mid, bottom: bottomRow ? toCreative(bottomRow, ctx.locale) : null };
}
