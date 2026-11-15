import { shopPath, shopReelsPath } from "@/lib/locapass/publicUrls";
import { resolveReservation } from "@/lib/shop/reservation";
import type { NavTarget } from "@/lib/shop/askShopAi";

/** 画面を動かす先(店舗ページの該当の場所・連絡の画面・電話)。予約の確定はお客様が行う(AIは確定しない)。 */
export type Nav = { kind: "reserve" | "goto" | "call"; path?: string; hash?: string; contact?: boolean; href?: string };
export type NavKey = NavTarget | "call" | "contact";
export const ALL_NAV_KEYS: NavKey[] = ["cast", "today", "price", "access", "reels", "call", "contact"];

type NavFacts = { slug: string; portalSlug: string; shopId: string; plan: string | null; phone: string | null; lineUrl: string | null; bookingUrl: string | null; sections: Record<NavTarget, boolean> };

export function makeNav(facts: NavFacts) {
  const base = shopPath(facts.portalSlug, facts.slug);
  const reservation = resolveReservation({ shopId: facts.shopId, plan: facts.plan, phone: facts.phone, lineUrl: facts.lineUrl, bookingUrl: facts.bookingUrl });
  const navForKey = (key: string): Nav | null => {
    if (key === "cast" || key === "today" || key === "price" || key === "access") return facts.sections[key] ? { kind: "goto", path: base, hash: key } : null;
    if (key === "reels") return facts.sections.reels ? { kind: "goto", path: shopReelsPath(facts.portalSlug, facts.slug) } : null;
    if (key === "call") return facts.phone ? { kind: "call", href: `tel:${facts.phone}` } : null;
    if (key === "contact") {
      if (!reservation) return null;
      if (reservation.mode === "priority") return { kind: "reserve", path: reservation.path }; // サイト内の優先予約ページ(日時を選んで確定する)
      if (reservation.mode === "external_url") return { kind: "reserve", href: reservation.url }; // 店舗の予約ページ
      return { kind: "reserve", path: base, contact: true }; // 電話・LINEの連絡画面
    }
    return null;
  };
  /** その店舗で使える画面のカード(選んでもらう用)。 */
  const allChoices = () =>
    ALL_NAV_KEYS.flatMap((key) => {
      const nav = navForKey(key);
      return nav ? [{ key, nav }] : [];
    });
  return { navForKey, allChoices };
}
