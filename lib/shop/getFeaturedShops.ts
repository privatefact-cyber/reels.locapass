import { createStaticClient } from "@/lib/supabase/static";
import { pickTranslation } from "@/lib/i18n/contentTranslation";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { isFeaturedSectionEnabled } from "@/lib/settings/platformSettings";
import type { Locale } from "@/lib/i18n/locale";
import type { FeaturedShop } from "@/components/home/FeaturedHero";

/**
 * トップページのFEATURED枠(ヒーロー+特集カード)に出す提携店舗。
 * shops.featured_rank が入っている店舗だけを、その順番で返す(運営者のみ設定可、00075参照)。
 * 公開情報だけなのでcookie非依存のクライアントで読む(CDNキャッシュ可能な他のマップAPIと同じ考え方)。
 *
 * 管理画面のトグル(platform_settings.featured_section_enabled)がオフの間は、
 * featured_rankやデータはそのまま残した状態で、表示だけ止める。
 * 「1店舗のキャバクラサイトに見える」という理由で一時オフにした経緯があるため、
 * データを消さずに戻せるようにしてある(2026-09-14)。
 */
export async function getFeaturedShops(locale: Locale, limit = 8): Promise<FeaturedShop[]> {
  if (!(await isFeaturedSectionEnabled())) return [];

  const supabase = createStaticClient();

  const { data: shops } = await supabase
    .from("shops")
    .select("id, name, area, genre, description, business_hours, cover_image_url, hero_media_url, hero_media_type, translations, featured_rank")
    .eq("status", "active")
    .not("featured_rank", "is", null)
    .order("featured_rank", { ascending: true })
    .limit(limit);

  if (!shops || shops.length === 0) return [];

  const shopIds = shops.map((s) => s.id);
  const { data: priceRows } = await supabase
    .from("shop_price_items")
    .select("shop_id, name, duration_minutes, price, name_translations, display_order")
    .in("shop_id", shopIds)
    .order("display_order", { ascending: true });

  const pricesByShop = new Map<string, typeof priceRows>();
  for (const p of priceRows ?? []) {
    const list = pricesByShop.get(p.shop_id) ?? [];
    list.push(p);
    pricesByShop.set(p.shop_id, list);
  }

  return shops.flatMap((s) => {
    const image = (s.hero_media_type === "image" ? s.hero_media_url : null) ?? s.cover_image_url;
    if (!image) return []; // FEATURED枠は写真ありきなので、写真が無い店舗は出さない。

    const description = pickTranslation(locale, s.description, s.translations, "description").text;
    const businessHours = pickTranslation(locale, s.business_hours, s.translations, "business_hours").text;

    const rawPrices = pricesByShop.get(s.id) ?? [];
    const prices = rawPrices.map((p) => ({
      name: pickTranslation(locale, p.name, p.name_translations, "name").text ?? p.name,
      durationMinutes: p.duration_minutes,
      price: p.price,
    }));
    // ヒーローの見出し価格は「セット/基本料金」だけから最安値を取る。指名料・同伴料等の
    // 付帯料金まで含めてMath.minすると、本来の入店料金より安い数字を大きく見せてしまう
    // (例: 指名料3,000円をセット料金として案内してしまう)。
    // 判定は原文(日本語)の店名で行う(翻訳後の文字列は言語によって"Set"が含まれるとは限らないため)。
    const setItems = rawPrices.filter((p) => /セット|基本(料金|台費)/.test(p.name));
    const setPriceFrom = setItems.length
      ? Math.min(...setItems.map((p) => p.price))
      : rawPrices.length
        ? Math.min(...rawPrices.map((p) => p.price))
        : null;

    const meta = [s.area, s.genre ? genreLabel(locale, s.genre) : null].filter(Boolean).join(" · ");

    const featured: FeaturedShop = {
      id: s.id,
      name: s.name,
      meta,
      imageUrl: image,
      description,
      businessHours,
      setPriceFrom,
      highlights: prices.slice(0, 3),
      area: s.area,
    };
    return [featured];
  });
}
