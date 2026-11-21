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
  /** 画像の見せたい中心(0〜100%)。枠に合わせて切り取るとき、この点が見えるようにする。 */
  focus?: { x: number; y: number };
};

/**
 * 広告を見ている人(閲覧者)の情報。有料店のカードは、閲覧者の現在地(IPアドレスから分かる、市区町村くらいの精度)が
 * 広告主のお店から配信範囲(radius_km)の中にあるときに優先して出す。業種は問わない。
 * 範囲の中に出せるカードが無い・現在地が分からないときは、全体の中から出す(出す先が空にならないように)。
 * どのカードを出すかは、データベース側(locapass_ad_pool)で決める。直近の表示が少ない店を優先する公平な配信で、
 * 広告主が何店に増えても、取得に上限は無い。
 */
export type AdContext = { shopId: string; locale: string; viewerLat?: number | null; viewerLng?: number | null; now?: number };

type Row = {
  id: string;
  label: string;
  headline: string;
  body: string | null;
  cta: string;
  link_url: string;
  image_url: string | null;
  image_focus_x: number;
  image_focus_y: number;
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
    focus: { x: r.image_focus_x ?? 50, y: r.image_focus_y ?? 50 },
  };
}

const CARD_COLS = "id, label, headline, body, cta, link_url, image_url, image_focus_x, image_focus_y, placement, starts_at, ends_at, translations";

/** 運営のカード(店舗に紐づかない)。数は少ないので、全部読む。 */
async function operatorCards(now: number): Promise<Row[]> {
  try {
    const { data, error } = await (createAdminClient() as any)
      .from("locapass_ad_cards")
      .select(CARD_COLS)
      .is("shop_id", null)
      .eq("is_active", true)
      .eq("status", "approved")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(20);
    if (error || !data) return [];
    return (data as Row[]).filter((r) => (!r.starts_at || Date.parse(r.starts_at) <= now) && (!r.ends_at || Date.parse(r.ends_at) > now));
  } catch {
    return [];
  }
}

type L4 = "ja" | "en" | "zh" | "ar";
const AUTO_LABEL: Record<L4, string> = { ja: "PR", en: "Ad", zh: "广告", ar: "إعلان" };
const AUTO_CTA: Record<L4, string> = { ja: "お店の詳細を見る", en: "View shop details", zh: "查看店铺详情", ar: "عرض تفاصيل المتجر" };

type Cand = { creative: AdCreative; placement: Row["placement"] };

/**
 * 店舗のカード(登録済み+自動)から、閲覧者に出す分(最大4枚)をデータベースで選び、その中身を取る。
 * 自動カードは、ADオプションの店舗が、配信中の自分のカードを1枚も持たないときの、お店の情報(店名・ひとこと・写真)から作るカード。
 */
async function chooseShopCards(ctx: AdContext): Promise<Cand[]> {
  try {
    const admin = createAdminClient() as any;
    const { data: picked, error } = await admin.rpc("locapass_ad_pool", {
      p_exclude_shop: ctx.shopId,
      p_lat: ctx.viewerLat ?? null,
      p_lng: ctx.viewerLng ?? null,
      p_limit: MAX_SHOP_CARDS,
    });
    if (error || !picked?.length) return [];
    const list = picked as { card_id: string | null; auto_shop_id: string | null }[];
    const cardIds = list.map((r) => r.card_id).filter((v): v is string => !!v);
    const autoIds = list.map((r) => r.auto_shop_id).filter((v): v is string => !!v);
    const [cards, shops] = await Promise.all([
      cardIds.length ? admin.from("locapass_ad_cards").select(CARD_COLS).in("id", cardIds) : Promise.resolve({ data: [] }),
      autoIds.length
        ? admin.from("locapass_shops").select("id, name, slug, tagline, cover_url, icon_url, portal:locapass_portals ( slug )").in("id", autoIds)
        : Promise.resolve({ data: [] }),
    ]);
    const cardMap = new Map<string, Row>(((cards.data ?? []) as Row[]).map((r) => [r.id, r]));
    const shopMap = new Map<string, any>(((shops.data ?? []) as any[]).map((r) => [r.id as string, r]));
    const loc: L4 = (["ja", "en", "zh", "ar"] as const).includes(ctx.locale as L4) ? (ctx.locale as L4) : "en";
    const out: Cand[] = [];
    for (const r of list) {
      if (r.card_id) {
        const row = cardMap.get(r.card_id);
        if (row) out.push({ creative: toCreative(row, ctx.locale), placement: row.placement });
      } else if (r.auto_shop_id) {
        const sh = shopMap.get(r.auto_shop_id);
        if (!sh) continue;
        const portal = Array.isArray(sh.portal) ? sh.portal[0] : sh.portal;
        out.push({
          placement: "both",
          creative: {
            id: `auto:${sh.id}`,
            label: AUTO_LABEL[loc],
            title: sh.name as string,
            sub: (sh.tagline as string | null) ?? "",
            cta: AUTO_CTA[loc],
            href: portal?.slug ? `/${portal.slug}/shops/${sh.slug}` : "/",
            imageUrl: (sh.cover_url as string | null) ?? (sh.icon_url as string | null),
          },
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** 1つのページに並べる店舗のカードの最大数(運営のカードとは別)。 */
const MAX_SHOP_CARDS = 4;

export async function getAdCreatives(ctx: AdContext): Promise<{ mid: AdCreative[]; bottom: AdCreative | null }> {
  const now = ctx.now ?? Date.now();
  const bucket = Math.floor(now / 3_600_000);
  const [operator, chosen] = await Promise.all([operatorCards(now), chooseShopCards(ctx)]);

  const mid = [...operator.filter((r) => r.placement !== "bottom").map((r) => toCreative(r, ctx.locale)), ...chosen.filter((c) => c.placement !== "bottom").map((c) => c.creative)];
  const bottomPool: AdCreative[] = [...operator.filter((r) => r.placement !== "mid").map((r) => toCreative(r, ctx.locale)), ...chosen.filter((c) => c.placement !== "mid").map((c) => c.creative)];
  const bottom = bottomPool.length ? bottomPool[hash(`${ctx.shopId}|bottom|${bucket}`) % bottomPool.length] : null;
  return { mid, bottom };
}
