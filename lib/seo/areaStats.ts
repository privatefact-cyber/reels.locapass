import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { isDemoShop } from "./demo";

export type PortalStat = {
  slug: string;
  name: string;
  total: number;
  categories: { category: string; count: number }[];
};

/**
 * ポータルごとの、実在の店舗(デモ・公式を除く)の数と、業種別の数。店舗の多いポータルが先。
 * /areas・/areas/[ポータル] を、登録された店舗から自動で作るために使う(店舗が増えれば、数もページも自動で増える)。
 */
export async function getPortalStats(supabase: SupabaseClient): Promise<PortalStat[]> {
  const [portals, shops] = await Promise.all([
    fetchAllRows<{ id: number; slug: string; name: string }>((from, to) =>
      supabase.from("locapass_portals").select("id, slug, name").eq("status", "active").order("id").range(from, to),
    ),
    fetchAllRows<{ portal_id: number; slug: string; name: string; category: string | null }>((from, to) =>
      supabase.from("locapass_shops").select("portal_id, slug, name, category").eq("status", "active").order("id").range(from, to),
    ),
  ]);
  const byPortal = new Map<number, Map<string, number>>();
  for (const s of shops) {
    if (isDemoShop(s.name, s.slug) || s.category === "公式") continue;
    const cats = byPortal.get(s.portal_id) ?? new Map<string, number>();
    const key = s.category ?? "その他";
    cats.set(key, (cats.get(key) ?? 0) + 1);
    byPortal.set(s.portal_id, cats);
  }
  return portals
    .map((p) => {
      const cats = byPortal.get(p.id) ?? new Map<string, number>();
      const categories = [...cats.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
      return { slug: p.slug, name: p.name, total: categories.reduce((s, c) => s + c.count, 0), categories };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** エリアガイドを作るポータルの条件: 実在の店舗が3件以上。水戸は、検索で押し出さない方針なので除く(isLowProfilePortal)。 */
export const MIN_SHOPS_FOR_GUIDE = 3;
