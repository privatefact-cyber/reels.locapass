import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { EventFormSection } from "@/components/locapass-dashboard/EventFormSection";
import { ShopPinEditor } from "@/components/locapass-dashboard/ShopPinEditor";
import { SingleImageDropzone } from "@/components/locapass-dashboard/EventImageDropzone";
import { FloorStatusDropzone } from "@/components/locapass-dashboard/FloorStatusDropzone";
import { ShopGalleryUploader } from "@/components/locapass-dashboard/ShopGalleryUploader";
import { CopyButton } from "@/components/locapass-dashboard/CopyButton";
import { RevealableQr } from "@/components/RevealableQr";
import { TodayScheduleBoard, type TodayScheduleRow } from "@/components/locapass-dashboard/TodayScheduleBoard";
import { ShopImportPanel } from "@/components/locapass-dashboard/ShopImportPanel";
import { ContactTapStatsCard } from "@/components/locapass-dashboard/ContactTapStatsCard";
import { ShopCompletenessCard } from "@/components/locapass-dashboard/ShopCompletenessCard";
import { computeProfileCompleteness } from "@/lib/shop/profileCompleteness";
import { LOCAPASS_CATEGORIES } from "@/lib/shop/locapassCategories";
import type { ShopEvent } from "@/lib/types/shop";
import { toJstDateString, getJstNow } from "@/lib/reels/nowWorking";
import {
  addEvent,
  addPriceItem,
  deleteEvent,
  deletePriceItem,
  updateEvent,
  updateShopProfile,
  upsertTodaySchedule,
} from "./actions";

/**
 * LUXELA本家の店舗情報画面(app/dashboard/shop/page.tsx)と同じ画面。
 * データはlocapass側だけを参照し、LUXELAのテーブルは一切読まない
 * (料金表 locapass_shop_price_items、イベント locapass_shop_events、本日の出勤 locapass_cast_members + locapass_schedules)。
 */
export default async function LocapassShopSettingsPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const currentShop = viewer.shop;

  const supabase = await createClient();
  const today = toJstDateString(getJstNow());
  const [
    { data: shopRow },
    { data: eventRows },
    { count: reelCount },
    { data: priceItemRows },
    { data: castRows },
    { data: favoriteCountRaw },
  ] = await Promise.all([
      supabase
        .from("locapass_shops")
        .select(
          "id, name, category, address, tel, business_hours, description, cover_url, url, line_url, lat, lng, occupancy_status, gallery_image_urls, area, sns_links, line_qr_image_url, hero_media_url, hero_media_type, usage_notes, price_info, shop_code",
        )
        .eq("id", currentShop.id)
        .single(),
      supabase
        .from("locapass_shop_events")
        .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_at")
        .eq("shop_id", currentShop.id)
        .order("created_at", { ascending: false }),
      // 掲載の充実度用。公開中のリールだけを数える(ストーリー・非表示は含めない)。
      supabase
        .from("locapass_reels")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", currentShop.id)
        .eq("status", "publish")
        .eq("reel_type", "permanent"),
      supabase
        .from("locapass_shop_price_items")
        .select("id, name, duration_minutes, price, display_order")
        .eq("shop_id", currentShop.id)
        .order("display_order", { ascending: true }),
      supabase
        .from("locapass_cast_members")
        .select("id, name, avatar_url, locapass_schedules ( id, start_time, end_time, is_working_today, date )")
        .eq("shop_id", currentShop.id)
        .eq("locapass_schedules.date", today)
        .order("name", { ascending: true }),
      supabase.rpc("locapass_count_shop_favorites", { p_shop_id: currentShop.id }),
    ]);

  if (!shopRow) {
    return <p className="text-sm text-red-600">店舗情報が見つかりません。</p>;
  }

  // 本家shopsの列名に揃える(category→genre, tel→phone, url→website_url, cover_url→cover_image_url)。
  const shop = {
    name: shopRow.name,
    area: shopRow.area,
    genre: shopRow.category,
    address: shopRow.address,
    phone: shopRow.tel,
    business_hours: shopRow.business_hours,
    price_info: shopRow.price_info,
    description: shopRow.description,
    cover_image_url: shopRow.cover_url,
    hero_media_url: shopRow.hero_media_url,
    hero_media_type: shopRow.hero_media_type,
    website_url: shopRow.url,
    usage_notes: shopRow.usage_notes,
    sns_links: (shopRow.sns_links ?? {}) as { x?: string; instagram?: string; line?: string },
    shop_code: shopRow.shop_code,
    line_url: shopRow.line_url,
    line_qr_image_url: shopRow.line_qr_image_url,
    lat: shopRow.lat,
    lng: shopRow.lng,
    geocode_source: null as string | null,
    occupancy_status: shopRow.occupancy_status,
    gallery_image_urls: shopRow.gallery_image_urls,
  };

  // 業種は固定10種類のプルダウン。現在値が一覧に無い場合(運営の「公式」や整理前の古い値)は、
  // 保存時に空になったり勝手に書き換わったりしないよう、その値も選択肢に足す。
  const genreChoices: string[] = [...LOCAPASS_CATEGORIES];
  if (shop.genre && !genreChoices.includes(shop.genre)) genreChoices.push(shop.genre);

  const favoriteCount = favoriteCountRaw ?? 0;
  const priceItems = priceItemRows ?? [];
  const todayScheduleRows: TodayScheduleRow[] = (castRows ?? []).map((c) => {
    const schedulesForCast = Array.isArray(c.locapass_schedules)
      ? c.locapass_schedules
      : c.locapass_schedules
        ? [c.locapass_schedules]
        : [];
    const todaySchedule = schedulesForCast[0] ?? null;
    return {
      castId: c.id,
      name: c.name,
      avatarUrl: c.avatar_url,
      scheduleId: todaySchedule?.id ?? null,
      isWorkingToday: todaySchedule?.is_working_today ?? false,
      startTime: todaySchedule?.start_time ?? null,
      endTime: todaySchedule?.end_time ?? null,
    };
  });

  const now = Date.now();
  const events: ShopEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    imageUrl: e.image_url,
    galleryImageUrls: e.gallery_image_urls ?? [],
    isEnded: !!e.ends_at && new Date(e.ends_at).getTime() < now,
  }));

  const basePath = `/dashboard/shop/${currentShop.id}`;
  const snsLinks = shop.sns_links ?? {};
  const completeness = computeProfileCompleteness({
    genre: shop.genre,
    coverImageUrl: shop.cover_image_url,
    heroMediaUrl: shop.hero_media_url,
    description: shop.description,
    businessHours: shop.business_hours,
    phone: shop.phone,
    lineUrl: shop.line_url,
    address: shop.address,
    lat: shop.lat,
    priceItemCount: priceItems.length,
    castCount: castRows?.length ?? 0,
    reelCount: reelCount ?? 0,
  });
  const completenessItems = completeness.items.map((item) =>
    item.href.startsWith("/dashboard/") ? { ...item, href: item.href.replace("/dashboard", basePath) } : item,
  );
  const shopPageUrl = `https://reels.locapass.net/shops/${currentShop.id}`;
  const shopQrDataUrl = await QRCode.toDataURL(shopPageUrl, { margin: 1, width: 220 });

  const occupancyStatus = shop.occupancy_status as {
    status: "available" | "few_seats" | "full";
    captured_at: string;
  } | null;
  const OCCUPANCY_LABEL: Record<string, string> = {
    available: "空席あり",
    few_seats: "残りわずか",
    full: "満席",
  };
  const initialOccupancyText = occupancyStatus
    ? `${OCCUPANCY_LABEL[occupancyStatus.status] ?? occupancyStatus.status}(撮影 ${new Date(
        occupancyStatus.captured_at,
      ).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`
    : null;

  const { data: contactTapStats } = await supabase.rpc("locapass_contact_tap_stats", { p_shop_id: currentShop.id });

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">店舗情報</h1>
          <p className="mt-1 text-sm text-slate-600">
            ここで編集した内容は表側ポータルの店舗ページに反映されます。
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center">
          <p className="text-2xl font-bold text-slate-900">{favoriteCount ?? 0}</p>
          <p className="text-xs text-slate-500">現在のお気に入り数</p>
        </div>
      </section>

      <ContactTapStatsCard stats={contactTapStats ?? []} />

      <ShopCompletenessCard percent={completeness.percent} items={completenessItems} />

      <TodayScheduleBoard
        date={today}
        rows={todayScheduleRows}
        upsertTodaySchedule={upsertTodaySchedule.bind(null, currentShop.id)}
        castDetailBasePath={`${basePath}/cast`}
      />

      <div id="shop-pin" className="scroll-mt-24">
        <ShopPinEditor
          shopId={currentShop.id}
          shopName={shop?.name ?? ""}
          address={shop?.address ?? null}
          lat={shop?.lat ?? null}
          lng={shop?.lng ?? null}
          geocodeSource={shop?.geocode_source ?? null}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">店舗コード</h2>
        <p className="mb-2 text-xs text-slate-500">
          他の店舗と重複しない識別コードです。運営とのやり取りなどで店舗を特定する際にお使いください。
        </p>
        <div className="flex max-w-xs gap-2">
          <input
            readOnly
            value={shop.shop_code}
            className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono tracking-widest text-slate-900"
          />
          <CopyButton value={shop.shop_code} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">店舗ページQRコード</h2>
        <p className="mb-2 text-xs text-slate-500">
          お客様にこの店舗の公開ページへアクセスしてもらうための短縮URL・QRコードです。
        </p>
        <div className="flex max-w-xs gap-2">
          <input
            readOnly
            value={shopPageUrl}
            className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900"
          />
          <CopyButton value={shopPageUrl} />
        </div>
        <div className="mt-2">
          <RevealableQr
            qrDataUrl={shopQrDataUrl}
            label="QRコードを表示(お客様にその場で見せる用)"
            buttonClassName="text-xs font-semibold text-blue-600 underline"
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">混雑状況(AIコンシェルジュ連携)</h2>
        <p className="mb-2 text-xs text-slate-500">
          フロア写真をアップロードすると、AIが混雑状況を判定してお問い合わせチャットに反映します。
        </p>
        <div className="max-w-xs">
          <FloorStatusDropzone shopId={currentShop.id} initialStatusText={initialOccupancyText} />
        </div>
      </section>

      <ShopImportPanel
        shopId={currentShop.id}
        defaultUrl={shop.website_url}
        current={{
          description: !!shop.description?.trim(),
          hours: !!shop.business_hours?.trim(),
          phone: !!shop.phone?.trim(),
          cover: !!shop.cover_image_url,
          hero: !!shop.hero_media_url,
        }}
      />

      <section id="shop-basic" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">基本情報</h2>
        <p className="-mt-2 mb-3 text-xs text-slate-500">
          お店紹介文・営業時間・利用説明は、保存すると英語・中国語に自動翻訳されて海外のお客さんにも表示されます。
        </p>
        <form action={updateShopProfile.bind(null, currentShop.id)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500">店舗名</label>
            <input
              name="name"
              defaultValue={shop.name}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">エリア</label>
            <input
              name="area"
              defaultValue={shop.area ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">ジャンル</label>
            <select
              name="genre"
              defaultValue={shop.genre ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">未選択</option>
              {genreChoices.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">電話番号</label>
            <input
              name="phone"
              defaultValue={shop.phone ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500">住所</label>
            <input
              name="address"
              defaultValue={shop.address ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">公式HP</label>
            <input
              name="website_url"
              defaultValue={shop.website_url ?? ""}
              placeholder="https://"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">営業時間</label>
            <input
              name="business_hours"
              defaultValue={shop.business_hours ?? ""}
              placeholder="例: 18:00〜翌5:00"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">X(Twitter)</label>
            <input
              name="sns_x"
              defaultValue={snsLinks.x ?? ""}
              placeholder="https://x.com/..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">Instagram</label>
            <input
              name="sns_instagram"
              defaultValue={snsLinks.instagram ?? ""}
              placeholder="https://instagram.com/..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">LINE</label>
            <input
              name="sns_line"
              defaultValue={snsLinks.line ?? ""}
              placeholder="https://line.me/..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">連絡用LINE友だち追加URL</label>
            <input
              name="line_url"
              defaultValue={shop.line_url ?? ""}
              placeholder="https://line.me/ti/p/..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              店舗ページの「連絡」ボタンから開くLINE問い合わせ用です。個人アカウント運用でも構いません。
            </p>
          </div>
          <div className="sm:col-span-2">
            <SingleImageDropzone
              shopId={currentShop.id}
              name="line_qr_image_url"
              label="連絡用LINEのQRコード画像(任意)"
              hint="設定すると「連絡」モーダルにQRコードを表示できます"
              defaultUrl={shop.line_qr_image_url}
              boxClassName="aspect-square w-full max-w-[200px]"
            />
          </div>
          <div id="shop-images" className="scroll-mt-24 sm:col-span-2">
            <SingleImageDropzone
              shopId={currentShop.id}
              name="cover_image_url"
              label="メイン画像(縦型・一覧のサムネイルに使われます)"
              defaultUrl={shop.cover_image_url}
              boxClassName="aspect-[3/4] w-full max-w-[220px]"
            />
          </div>
          <div className="sm:col-span-2">
            <SingleImageDropzone
              shopId={currentShop.id}
              name="hero_media_url"
              label="トップ画像/動画(横長・店舗ページ上部に表示されます)"
              hint="推奨サイズ: 1600×600px前後(横長)。動画は10〜15秒程度・自動ループ再生されます"
              defaultUrl={shop.hero_media_url}
              defaultType={(shop.hero_media_type as "image" | "video" | null) ?? "image"}
              acceptVideo
              boxClassName="aspect-[16/6] w-full max-w-md"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500">お店紹介文</label>
            <textarea
              name="description"
              defaultValue={shop.description ?? ""}
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500">利用説明</label>
            <textarea
              name="usage_notes"
              defaultValue={shop.usage_notes ?? ""}
              rows={4}
              placeholder="ご利用の流れ、注意事項など"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <input type="hidden" name="price_info" value={shop.price_info ?? ""} />
          <button
            type="submit"
            className="sm:col-span-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            更新する
          </button>
        </form>
      </section>

      <section id="shop-gallery" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">店舗紹介ギャラリー</h2>
        <p className="-mt-1 mb-3 text-xs text-slate-500">
          店内の雰囲気が伝わる写真を最大10枚まで登録できます。表側の店舗ページに表示されます。
        </p>
        <ShopGalleryUploader shopId={currentShop.id} initialUrls={shop.gallery_image_urls ?? []} />
      </section>

      <section id="shop-price" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">料金表</h2>
        {priceItems && priceItems.length > 0 && (
          <ul className="mb-4 divide-y divide-black/10">
            {priceItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {item.name}
                  {item.duration_minutes ? `(${item.duration_minutes}分)` : ""}
                </span>
                <div className="flex items-center gap-3">
                  <span>¥{item.price.toLocaleString()}</span>
                  <form action={deletePriceItem.bind(null, currentShop.id, item.id)}>
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                      削除
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={addPriceItem.bind(null, currentShop.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            name="name"
            required
            placeholder="コース名"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="duration_minutes"
            type="number"
            placeholder="時間(分)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="price"
            type="number"
            required
            placeholder="料金(円)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            追加
          </button>
        </form>
      </section>

      <EventFormSection
        shopId={currentShop.id}
        events={events}
        addEvent={addEvent.bind(null, currentShop.id)}
        updateEvent={updateEvent.bind(null, currentShop.id)}
        deleteEvent={deleteEvent.bind(null, currentShop.id)}
      />
    </div>
  );
}
