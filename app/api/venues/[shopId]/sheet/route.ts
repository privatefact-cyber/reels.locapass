import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { isOpenNow, sanitizeWeekly } from "@/lib/shop/businessHours";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { castPath, shopPhotosPath } from "@/lib/locapass/publicUrls";
import { getShopPhotoPosts } from "@/lib/photo/getShopPhotoPosts";
import { getAiProfile, type AiProfile } from "@/lib/shop/aiProfile";

// マップのカードを広げたときに出す「店舗の詳細シート」用の、1店舗分の軽い取得API。
// 一覧(getVenueCards)に全部載せると重くなるので、広げたときだけ取りに来る。公開情報だけを返す。
export const runtime = "nodejs";

export type VenueSheetFace = { id: string; name: string; avatarUrl: string | null; href: string; workingToday: boolean };
export type VenueSheetPhoto = { id: string; imageUrl: string; caption: string | null };
export type VenueSheetData = {
  /** 営業時間(曜日ごとのカレンダー)が登録されているときだけ true/false。未登録は null(バッジを出さない)。 */
  openNow: boolean | null;
  /** FACES(在籍キャスト。最大40人)。本日出勤の人は workingToday=true。 */
  faces: VenueSheetFace[];
  /** みんなの写真(訪問者の投稿・新しい順で最大8枚)。 */
  photos: VenueSheetPhoto[];
  /** 「もっと見る」の行き先(店舗のみんなの写真ページ)。 */
  photosHref: string;
  /** 料金メニューのうち、いちばん安い項目。登録が無ければ null。 */
  minPrice: { name: string; minutes: number | null; price: number } | null;
  /** 予約ボタンの行き先。店舗の予約URL → LINE → 電話の順。どれも無ければ null(店舗詳細へ)。 */
  reserve: { href: string; label: string | null; external: boolean } | null;
  phone: string | null;
  /** 店舗AI質問(有料オプション)がオンの店舗だけ true。 */
  aiChat: boolean;
  /** AIコンシェルジュの顔(店長・店舗が設定したキャラクター。承諾済みのものだけ)。無ければ null。 */
  aiAvatar: AiProfile | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const supabase = createStaticClient();

  const { data: shop, error } = await supabase
    .from("locapass_shops")
    .select("id, slug, name, status, tel, line_url, booking_url, booking_label, business_hours_weekly, venue_id, lat, lng, portal:locapass_portals ( slug )")
    .eq("id", shopId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  if (!shop) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 });
  const portal = Array.isArray(shop.portal) ? shop.portal[0] : shop.portal;
  if (!portal?.slug) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 });
  const portalSlug = portal.slug as string;
  const shopSlug = shop.slug as string;

  const nowJst = getJstNow();
  // オプション列は型定義に無いので、別に引く。
  const { data: aiRow } = await (supabase as any).from("locapass_shops").select("ai_chat_enabled").eq("id", shop.id).maybeSingle();
  const [{ data: castRows, error: castError }, { data: priceRows }, photoPosts] = await Promise.all([
    // 公開用ビュー(個人情報を含まない・公開中店舗の退会していないキャストだけ)。
    supabase.from("locapass_public_casts").select("id, name, issue_no, avatar_url").eq("shop_id", shop.id).order("name").limit(40),
    supabase.from("locapass_shop_price_items").select("name, duration_minutes, price").eq("shop_id", shop.id).order("price", { ascending: true }).limit(1),
    // 訪問者の投稿写真(審査済み・店舗が非表示にしたものを除く既存の取得をそのまま使う)。失敗しても本体は返す。
    getShopPhotoPosts({ id: shop.id, name: shop.name as string, venueId: (shop.venue_id as string | null) ?? null, lat: (shop.lat as number | null) ?? null, lng: (shop.lng as number | null) ?? null }, 8).catch(() => []),
  ]);
  if (castError) return NextResponse.json({ error: "FACESの取得に失敗しました" }, { status: 500 });

  const ids = (castRows ?? []).map((c) => c.id as string);
  const [{ data: scheduleRows }, { data: mediaRows }] = ids.length
    ? await Promise.all([
        supabase.from("locapass_schedules").select("cast_id").in("cast_id", ids).eq("date", toJstDateString(nowJst)).eq("is_working_today", true),
        supabase.from("locapass_media").select("cast_id, url, display_order").in("cast_id", ids).order("display_order", { ascending: true }),
      ])
    : [{ data: [] as { cast_id: string }[] }, { data: [] as { cast_id: string | null; url: string }[] }];
  const workingIds = new Set((scheduleRows ?? []).map((r) => r.cast_id as string));
  const firstMedia = new Map<string, string>();
  for (const m of mediaRows ?? []) if (m.cast_id && !firstMedia.has(m.cast_id)) firstMedia.set(m.cast_id, m.url);
  const faces: VenueSheetFace[] = (castRows ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) || "",
    // マイページで設定したアイコン写真を優先。未設定のときだけギャラリーの1枚目(マップのカードと同じ)。
    avatarUrl: (c.avatar_url as string | null) ?? firstMedia.get(c.id as string) ?? null,
    href: castPath(portalSlug, shopSlug, c.issue_no as number),
    workingToday: workingIds.has(c.id as string),
  }));

  const weekly = sanitizeWeekly(shop.business_hours_weekly);
  const cheapest = priceRows?.[0];
  const phone = (shop.tel as string | null) ?? null;
  const bookingUrl = (shop.booking_url as string | null) ?? null;
  const lineUrl = (shop.line_url as string | null) ?? null;
  const reserve = bookingUrl
    ? { href: bookingUrl, label: (shop.booking_label as string | null) ?? null, external: true }
    : lineUrl
      ? { href: lineUrl, label: null, external: true }
      : phone
        ? { href: `tel:${phone}`, label: null, external: false }
        : null;

  const body: VenueSheetData = {
    openNow: weekly ? isOpenNow(weekly, nowJst) : null,
    faces,
    photos: photoPosts.slice(0, 8).map((p) => ({ id: p.id, imageUrl: p.imageUrl, caption: p.comment ?? p.spotName ?? null })),
    photosHref: shopPhotosPath(portalSlug, shopSlug),
    minPrice: cheapest ? { name: cheapest.name as string, minutes: (cheapest.duration_minutes as number | null) ?? null, price: cheapest.price as number } : null,
    reserve,
    phone,
    aiChat: Boolean(aiRow?.ai_chat_enabled),
    aiAvatar: aiRow?.ai_chat_enabled ? await getAiProfile(shop.id as string) : null,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
