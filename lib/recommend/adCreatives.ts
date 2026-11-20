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

/**
 * 広告を出す側のページ(無料掲載の店舗)の情報。有料店のカードは、そのお店から配信範囲(radius_km)の中にあるページにだけ出す。
 * 業種は問わない(ランチを探していて、近くのピラティスが見つかる、という出会いも狙う)。座標が無いときは、同じ地域名(area)で代用する。
 */
export type AdContext = { shopId: string; locale: string; lat?: number | null; lng?: number | null; area?: string | null; now?: number };

/** 配信範囲の既定(km)。 */
export const AD_DEFAULT_RADIUS_KM = 10;

/** 2点間の距離(km)。 */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** このページが広告主から見て配信範囲の中なら、距離(km)を返す。範囲外なら null。座標が無いときは同じ地域名なら遠めの距離(999)として通す。 */
function distanceIfInRange(
  adv: { lat: number | null; lng: number | null; area: string | null },
  radiusKm: number,
  ctx: AdContext,
): number | null {
  if (adv.lat != null && adv.lng != null && ctx.lat != null && ctx.lng != null) {
    const d = distanceKm(adv.lat, adv.lng, ctx.lat, ctx.lng);
    return d <= radiusKm ? d : null;
  }
  if (adv.area && ctx.area && adv.area === ctx.area) return 999;
  return null;
}

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
  radius_km: number;
  /** 広告主の店舗(運営のカードは null)。 */
  shop: { lat: number | null; lng: number | null; area: string | null; plan: string; status: string; ad_option_enabled: boolean } | null;
  /** このページとの距離(km)。運営のカードは null。並び順に使う。 */
  dist?: number | null;
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
        "id, label, headline, body, cta, link_url, image_url, placement, starts_at, ends_at, translations, shop_id, radius_km, shop:locapass_shops ( lat, lng, area, plan, status, ad_option_enabled )",
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
      .flatMap((r): Row[] => {
        if (!r.shop_id) return [{ ...r, dist: null }]; // 運営のカードは全ページ
        const adv = r.shop;
        if (!adv || r.shop_id === ctx.shopId) return []; // 自分のページには出さない
        if (!adv.ad_option_enabled || adv.status !== "active" || AD_ADVERTISER_EXCLUDED_PLANS.includes(adv.plan)) return [];
        const dist = distanceIfInRange(adv, r.radius_km ?? AD_DEFAULT_RADIUS_KM, ctx);
        return dist == null ? [] : [{ ...r, dist }];
      })
      // 運営のカードが先、店舗のカードは近い順。
      .sort((x, y) => (x.dist == null ? 0 : 1) - (y.dist == null ? 0 : 1) || (x.dist ?? 0) - (y.dist ?? 0));
  } catch {
    return [];
  }
}

type L4 = "ja" | "en" | "zh" | "ar";
const AUTO_LABEL: Record<L4, string> = { ja: "PR", en: "Ad", zh: "广告", ar: "إعلان" };
const AUTO_CTA: Record<L4, string> = { ja: "お店の詳細を見る", en: "View shop details", zh: "查看店铺详情", ar: "عرض تفاصيل المتجر" };

/**
 * ADオプションの店舗が、配信中(承認済み)の自分のカードが1枚も無いときの自動カード。お店の情報(店名・ひとこと・写真)から作り、
 * リンク先は、その店の詳細ページ。設定をしなくても配信が始まる。お店が自分で公開している情報だけなので、承認は要らない。
 * 配信範囲は既定(AD_DEFAULT_RADIUS_KM)で、近い順に最大4店。
 */
async function autoCards(ctx: AdContext): Promise<AdCreative[]> {
  const hasCoords = ctx.lat != null && ctx.lng != null;
  if (!hasCoords && !ctx.area) return [];
  try {
    const admin = createAdminClient() as any;
    let query = admin
      .from("locapass_shops")
      .select("id, name, slug, tagline, cover_url, icon_url, plan, lat, lng, area, portal:locapass_portals ( slug )")
      .eq("ad_option_enabled", true)
      .eq("status", "active")
      .neq("id", ctx.shopId);
    if (hasCoords) {
      // 範囲の外を先に落とす(1度は約111km)。細かい距離は、あとで測る。
      const dLat = AD_DEFAULT_RADIUS_KM / 111 + 0.01;
      const dLng = AD_DEFAULT_RADIUS_KM / (111 * Math.max(0.2, Math.cos((ctx.lat! * Math.PI) / 180))) + 0.01;
      query = query.gte("lat", ctx.lat! - dLat).lte("lat", ctx.lat! + dLat).gte("lng", ctx.lng! - dLng).lte("lng", ctx.lng! + dLng);
    } else {
      query = query.eq("area", ctx.area);
    }
    const { data: shops } = await query.limit(60);
    const ranked = ((shops ?? []) as any[])
      .filter((r) => !AD_ADVERTISER_EXCLUDED_PLANS.includes(r.plan))
      .flatMap((r) => {
        const dist = distanceIfInRange(r, AD_DEFAULT_RADIUS_KM, ctx);
        return dist == null ? [] : [{ r, dist }];
      });
    if (ranked.length === 0) return [];
    const { data: owned } = await admin.from("locapass_ad_cards").select("shop_id").eq("status", "approved").eq("is_active", true).in("shop_id", ranked.map((x) => x.r.id));
    const hasOwn = new Set(((owned ?? []) as { shop_id: string }[]).map((r) => r.shop_id));
    const loc: L4 = (["ja", "en", "zh", "ar"] as const).includes(ctx.locale as L4) ? (ctx.locale as L4) : "en";
    return ranked
      .filter((x) => !hasOwn.has(x.r.id))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4)
      .map(({ r }) => {
        const portal = Array.isArray(r.portal) ? r.portal[0] : r.portal;
        return {
          id: `auto:${r.id}`,
          label: AUTO_LABEL[loc],
          title: r.name as string,
          sub: (r.tagline as string | null) ?? "",
          cta: AUTO_CTA[loc],
          href: portal?.slug ? `/${portal.slug}/shops/${r.slug}` : "/",
          imageUrl: (r.cover_url as string | null) ?? (r.icon_url as string | null),
        };
      });
  } catch {
    return [];
  }
}

export async function getAdCreatives(ctx: AdContext): Promise<{ mid: AdCreative[]; bottom: AdCreative | null }> {
  const now = ctx.now ?? Date.now();
  const rows = await activeCards(ctx, now);
  const auto = await autoCards(ctx);
  const mid = [...rows.filter((r) => r.placement !== "bottom").map((r) => toCreative(r, ctx.locale)), ...auto];
  const bottomRows = rows.filter((r) => r.placement !== "mid");
  const bucket = Math.floor(now / 3_600_000);
  const bottomPool: AdCreative[] = [...bottomRows.map((r) => toCreative(r, ctx.locale)), ...auto];
  const bottom = bottomPool.length ? bottomPool[hash(`${ctx.shopId}|bottom|${bucket}`) % bottomPool.length] : null;
  return { mid, bottom };
}
