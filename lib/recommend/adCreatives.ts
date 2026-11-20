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
 * 広告を見ている人(閲覧者)の情報。有料店のカードは、閲覧者の現在地(IPアドレスから分かる、市区町村くらいの精度)が
 * 広告主のお店から配信範囲(radius_km)の中にあるときに出す。業種は問わない。
 * 範囲の中に出せるカードが無い・現在地が分からないときは、対象のカードの中からランダムに出す(出す先が空にならないように)。
 */
export type AdContext = { shopId: string; locale: string; viewerLat?: number | null; viewerLng?: number | null; now?: number };

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

/** 閲覧者の現在地が分かっているとき、広告主のお店までの距離(km)。分からなければ null。 */
function viewerDistanceKm(adv: { lat: number | null; lng: number | null }, ctx: AdContext): number | null {
  if (adv.lat == null || adv.lng == null || ctx.viewerLat == null || ctx.viewerLng == null) return null;
  return distanceKm(adv.lat, adv.lng, ctx.viewerLat, ctx.viewerLng);
}

/** ADオプションで広告を出せないプラン(無料・簡易版)。 */
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
  /** 閲覧者との距離(km)。運営のカードや、現在地が不明なときは null。並び順に使う。 */
  dist?: number | null;
  /** 閲覧者の現在地が配信範囲の中か。 */
  inRange?: boolean;
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
        if (!r.shop_id) return [{ ...r, dist: null, inRange: true }]; // 運営のカードは全員に
        const adv = r.shop;
        if (!adv || r.shop_id === ctx.shopId) return []; // 自分のページには出さない
        if (!adv.ad_option_enabled || adv.status !== "active" || AD_ADVERTISER_EXCLUDED_PLANS.includes(adv.plan)) return [];
        const dist = viewerDistanceKm(adv, ctx);
        return [{ ...r, dist, inRange: dist != null && dist <= (r.radius_km ?? AD_DEFAULT_RADIUS_KM) }];
      });
  } catch {
    return [];
  }
}

type L4 = "ja" | "en" | "zh" | "ar";
const AUTO_LABEL: Record<L4, string> = { ja: "PR", en: "Ad", zh: "广告", ar: "إعلان" };
const AUTO_CTA: Record<L4, string> = { ja: "お店の詳細を見る", en: "View shop details", zh: "查看店铺详情", ar: "عرض تفاصيل المتجر" };

type AutoCandidate = { creative: AdCreative; dist: number | null; inRange: boolean };

/**
 * ADオプションの店舗が、配信中(承認済み)の自分のカードが1枚も無いときの自動カード。お店の情報(店名・ひとこと・写真)から作り、
 * リンク先は、その店の詳細ページ。設定をしなくても配信が始まる。お店が自分で公開している情報だけなので、承認は要らない。
 */
async function autoCandidates(ctx: AdContext): Promise<AutoCandidate[]> {
  try {
    const admin = createAdminClient() as any;
    const { data: shops } = await admin
      .from("locapass_shops")
      .select("id, name, slug, tagline, cover_url, icon_url, plan, lat, lng, portal:locapass_portals ( slug )")
      .eq("ad_option_enabled", true)
      .eq("status", "active")
      .neq("id", ctx.shopId)
      .limit(200);
    const eligible = ((shops ?? []) as any[]).filter((r) => !AD_ADVERTISER_EXCLUDED_PLANS.includes(r.plan));
    if (eligible.length === 0) return [];
    const { data: owned } = await admin.from("locapass_ad_cards").select("shop_id").eq("status", "approved").eq("is_active", true).in("shop_id", eligible.map((r) => r.id));
    const hasOwn = new Set(((owned ?? []) as { shop_id: string }[]).map((r) => r.shop_id));
    const loc: L4 = (["ja", "en", "zh", "ar"] as const).includes(ctx.locale as L4) ? (ctx.locale as L4) : "en";
    return eligible
      .filter((r) => !hasOwn.has(r.id))
      .map((r) => {
        const portal = Array.isArray(r.portal) ? r.portal[0] : r.portal;
        const dist = viewerDistanceKm(r, ctx);
        return {
          dist,
          inRange: dist != null && dist <= AD_DEFAULT_RADIUS_KM,
          creative: {
            id: `auto:${r.id}`,
            label: AUTO_LABEL[loc],
            title: r.name as string,
            sub: (r.tagline as string | null) ?? "",
            cta: AUTO_CTA[loc],
            href: portal?.slug ? `/${portal.slug}/shops/${r.slug}` : "/",
            imageUrl: (r.cover_url as string | null) ?? (r.icon_url as string | null),
          },
        };
      });
  } catch {
    return [];
  }
}

/** 1つのページに並べる店舗のカードの最大数(運営のカードとは別)。 */
const MAX_SHOP_CARDS = 4;

export async function getAdCreatives(ctx: AdContext): Promise<{ mid: AdCreative[]; bottom: AdCreative | null }> {
  const now = ctx.now ?? Date.now();
  const bucket = Math.floor(now / 3_600_000);
  const [rows, autos] = await Promise.all([activeCards(ctx, now), autoCandidates(ctx)]);

  // 店舗のカード(登録済み+自動)を、閲覧者の現在地が配信範囲の中のものに絞る。1つも無ければ、全部の中からランダム(時間ごとに安定)。
  type Cand = { creative: AdCreative; dist: number | null; inRange: boolean; placement: Row["placement"] };
  const shopCands: Cand[] = [
    ...rows.filter((r) => r.shop_id).map((r) => ({ creative: toCreative(r, ctx.locale), dist: r.dist ?? null, inRange: !!r.inRange, placement: r.placement })),
    ...autos.map((a) => ({ ...a, placement: "both" as const })),
  ];
  const inRange = shopCands.filter((c) => c.inRange).sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
  const chosen = (inRange.length > 0 ? inRange : [...shopCands].sort((a, b) => hash(`${a.creative.id}|${ctx.shopId}|${bucket}`) - hash(`${b.creative.id}|${ctx.shopId}|${bucket}`))).slice(0, MAX_SHOP_CARDS);

  const operator = rows.filter((r) => !r.shop_id);
  const mid = [...operator.filter((r) => r.placement !== "bottom").map((r) => toCreative(r, ctx.locale)), ...chosen.filter((c) => c.placement !== "bottom").map((c) => c.creative)];
  const bottomPool: AdCreative[] = [...operator.filter((r) => r.placement !== "mid").map((r) => toCreative(r, ctx.locale)), ...chosen.filter((c) => c.placement !== "mid").map((c) => c.creative)];
  const bottom = bottomPool.length ? bottomPool[hash(`${ctx.shopId}|bottom|${bucket}`) % bottomPool.length] : null;
  return { mid, bottom };
}
