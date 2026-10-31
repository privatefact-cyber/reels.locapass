import type { createStaticClient } from "@/lib/supabase/static";

type Supabase = ReturnType<typeof createStaticClient>;
type PostLite = { id: string; site: string; venue_id: string | null; place_kind: string | null; spot_name: string | null; place_name: string | null; latitude: number; longitude: number };
export type PostShop = { id: string; name: string; href: string; area: string | null };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_()（）「」【】&＆×x.,'’"]/g, "");
function nameLike(a: string | null | undefined, b: string) {
  if (!a) return false;
  const x = norm(a);
  const y = norm(b);
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
}

/**
 * 写真が「掲載店」の写真なら、その店舗ページへのリンク情報を返す(写真の店名をタップして店舗詳細へ飛ぶため)。
 * 紐付けの優先順位:
 *  1. 管理者が「この店舗に表示する」と指定した店舗(locapass_shop_photo_links の attach)
 *  2. 投稿者が掲載店として選んだ写真(place_kind=listed)の、掲載店(venue)に対応する店舗
 *  3. 店舗の近く(約150m)で、場所名が店舗名に似ている写真
 * 管理者が「この店舗では出さない」にした店舗は、どの方法でも結び付けない。
 * 投稿時の自動紐付けは「近くの別の掲載店」になることがあるので、listed以外は venue だけでは結び付けない。
 */
export async function resolvePostShops(supabase: Supabase, posts: PostLite[]): Promise<Map<string, PostShop>> {
  const all = await resolvePostShopList(supabase, posts);
  const first = new Map<string, PostShop>();
  for (const [id, list] of all) if (list[0]) first.set(id, list[0]);
  return first;
}

/**
 * 写真・動画が紹介している店舗の一覧(複数店舗を紹介した動画用)。
 * 管理者または投稿者が「この店舗に表示する」と結び付けた店舗(attach)をすべて入れ、
 * 掲載店・近くの店舗からの自動判定の結果も(重複しなければ)加える。先頭がこれまでの単数の「店名リンク」。
 */
export async function resolvePostShopList(supabase: Supabase, posts: PostLite[]): Promise<Map<string, PostShop[]>> {
  const result = new Map<string, PostShop[]>();
  if (posts.length === 0) return result;

  const { data: shopRows } = await (supabase as any)
    .from("locapass_shops")
    .select("id, slug, name, area, lat, lng, venue_id, locapass_portals(slug)")
    .eq("status", "active");
  type ShopRow = { id: string; slug: string; name: string; area: string | null; lat: number | null; lng: number | null; venue_id: string | null; locapass_portals: { slug: string } | { slug: string }[] | null };
  const shops = ((shopRows ?? []) as ShopRow[])
    .map((s) => {
      const portal = Array.isArray(s.locapass_portals) ? s.locapass_portals[0] : s.locapass_portals;
      return portal?.slug ? { ...s, portalSlug: portal.slug } : null;
    })
    .filter((s): s is ShopRow & { portalSlug: string } => s !== null);
  const hrefOf = (s: { portalSlug: string; slug: string }) => `/${s.portalSlug}/shops/${s.slug}`;

  const { data: linkRows } = await (supabase as any)
    .from("locapass_shop_photo_links")
    .select("post_id, shop_id, mode")
    .in("post_id", posts.map((p) => p.id));
  const links = (linkRows ?? []) as { post_id: string; shop_id: string; mode: "attach" | "hide" }[];
  const hidden = new Set(links.filter((l) => l.mode === "hide").map((l) => `${l.post_id}:${l.shop_id}`));
  const attachedByPost = new Map<string, string[]>();
  for (const l of links) if (l.mode === "attach") attachedByPost.set(l.post_id, [...(attachedByPost.get(l.post_id) ?? []), l.shop_id]);

  const byId = new Map(shops.map((s) => [s.id, s]));
  for (const p of posts) {
    const ok = (s: { id: string }) => !hidden.has(`${p.id}:${s.id}`);
    let found: (typeof shops)[number] | undefined;

    const attachedShops = (attachedByPost.get(p.id) ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is (typeof shops)[number] => s !== undefined && ok(s));

    if (p.place_kind === "listed" && p.venue_id) {
      const cands = shops.filter((s) => s.venue_id === p.venue_id && ok(s));
      found = cands.find((s) => s.portalSlug === p.site) ?? cands[0];
    }

    if (!found && attachedShops.length === 0) {
      const d = 0.0015;
      const near = shops.filter(
        (s) =>
          ok(s) &&
          s.lat != null &&
          s.lng != null &&
          Math.abs(s.lat - p.latitude) <= d &&
          Math.abs(s.lng - p.longitude) <= d &&
          (nameLike(p.spot_name, s.name) || nameLike(p.place_name, s.name)),
      );
      found = near.find((s) => s.portalSlug === p.site) ?? near[0];
    }

    const list = [...attachedShops];
    if (found && !list.some((s) => s.id === found!.id)) list.push(found);
    if (list.length > 0) result.set(p.id, list.map((s) => ({ id: s.id, name: s.name, href: hrefOf(s), area: s.area })));
  }
  return result;
}
