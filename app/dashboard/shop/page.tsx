import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { EventFormSection } from "@/components/dashboard/EventFormSection";
import { ShopPinEditor } from "@/components/dashboard/ShopPinEditor";
import { SingleImageDropzone } from "@/components/dashboard/EventImageDropzone";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { RevealableQr } from "@/components/RevealableQr";
import { TodayScheduleBoard, type TodayScheduleRow } from "@/components/dashboard/TodayScheduleBoard";
import { ShopImportPanel } from "@/components/dashboard/ShopImportPanel";
import { ShopCompletenessCard } from "@/components/dashboard/ShopCompletenessCard";
import { computeProfileCompleteness } from "@/lib/shop/profileCompleteness";
import type { ShopEvent } from "@/lib/types/shop";
import { SHOP_GENRES } from "@/lib/shop/genres";
import { toJstDateString, getJstNow } from "@/lib/reels/nowWorking";
import {
  addEvent,
  addPriceItem,
  deleteEvent,
  deletePriceItem,
  updateShopProfile,
  upsertTodaySchedule,
} from "./actions";

export default async function ShopSettingsPage() {
  const currentShop = await requireCurrentShop();
  if (!currentShop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();
  const today = toJstDateString(getJstNow());
  const [
    { data: shop },
    { data: priceItems },
    { data: eventRows },
    { data: castRows },
    { data: favoriteCount },
    { count: reelCount },
  ] = await Promise.all([
    supabase
      .from("shops")
      .select(
        "id, name, area, genre, address, phone, business_hours, price_info, description, cover_image_url, hero_media_url, hero_media_type, website_url, usage_notes, sns_links, shop_code, line_url, line_qr_image_url, lat, lng, geocode_source",
      )
      .eq("id", currentShop.id)
      .single(),
    supabase
      .from("shop_price_items")
      .select("id, name, duration_minutes, price, display_order")
      .eq("shop_id", currentShop.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("shop_events")
      .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_at")
      .eq("shop_id", currentShop.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("cast_members")
      .select("id, name, avatar_url, schedules ( id, start_time, end_time, is_working_today, date )")
      .eq("shop_id", currentShop.id)
      .eq("schedules.date", today)
      .order("name", { ascending: true }),
    supabase.rpc("count_shop_favorites", { p_shop_id: currentShop.id }),
    // 掲載の充実度用。公開中のリールだけを数える(ストーリー・非表示は含めない)。
    supabase
      .from("reels")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", currentShop.id)
      .eq("status", "published")
      .eq("post_type", "reel"),
  ]);

  const todayScheduleRows: TodayScheduleRow[] = (castRows ?? []).map((c) => {
    const schedulesForCast = Array.isArray(c.schedules) ? c.schedules : c.schedules ? [c.schedules] : [];
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

  if (!shop) {
    return <p className="text-sm text-red-600">店舗情報が見つかりません。</p>;
  }

  const snsLinks = (shop.sns_links as { x?: string; instagram?: string; line?: string }) ?? {};
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
    priceItemCount: priceItems?.length ?? 0,
    castCount: castRows?.length ?? 0,
    reelCount: reelCount ?? 0,
  });
  const shopPageUrl = `https://reels.locapass.net/s/${shop.shop_code}`;
  const shopQrDataUrl = await QRCode.toDataURL(shopPageUrl, { margin: 1, width: 220 });

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

      <ShopCompletenessCard percent={completeness.percent} items={completeness.items} />

      <TodayScheduleBoard date={today} rows={todayScheduleRows} upsertTodaySchedule={upsertTodaySchedule} />

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

      <ShopImportPanel
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
        <form action={updateShopProfile} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              {SHOP_GENRES.map((g) => (
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
                  <form action={deletePriceItem.bind(null, item.id)}>
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                      削除
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={addPriceItem} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        addEvent={addEvent}
        deleteEvent={deleteEvent}
      />
    </div>
  );
}
