import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  MapPin,
  Phone,
  Clock,
  DollarSign,
  ExternalLink,
  Globe,
  AtSign,
  Camera,
  MessageCircle,
  CalendarDays,
  Users,
  Star,
  Navigation,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { CastCard } from "@/components/CastCard";
import { InquiryButton } from "@/components/InquiryButton";
import { ShopAccordion } from "@/components/ShopAccordion";
import { ShopSectionNav } from "@/components/ShopSectionNav";
import { ShopFollowButton } from "@/components/ShopFollowButton";
import { StoryRing } from "@/components/StoryRing";
import { JsonLd } from "@/components/JsonLd";
import type { Cast, PriceItem, ShopEvent, Store } from "@/lib/types/shop";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { pickTranslation } from "@/lib/i18n/contentTranslation";

// revalidate指定が無いと無期限にキャッシュされ続け、本日の出勤・新着リールなど
// 日次/都度更新のデータが反映されなくなる(実際に発生した不具合)。トップページと
// 同じ60秒キャッシュに揃える。
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shopId: string }>;
}): Promise<Metadata> {
  const { shopId } = await params;
  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("name, category, tagline, description, cover_url, icon_url")
    .eq("id", shopId)
    .eq("status", "active")
    .single();

  if (!shop) {
    return { title: "店舗が見つかりません | LOCAPASS" };
  }

  const title = `${shop.name}｜${shop.category ?? "掲載店舗"}情報 - LOCAPASS`;
  const description =
    shop.tagline ||
    (shop.description ? shop.description.slice(0, 120) : null) ||
    `「${shop.name}」の店舗情報・リールを今すぐチェック。`;
  const url = `https://reels.locapass.net/shops/${shopId}`;
  const image = shop.cover_url ?? shop.icon_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "LOCAPASS",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const supabase = await createClient();
  const locale = await getServerLocale();
  const t = dictionaries[locale];
  // Google Mapsのhlパラメータは"zh"単体を認識しないため簡体字コードに変換する。
  const mapsHl = locale === "zh" ? "zh-CN" : locale;

  const { data: shopRow, error: shopError } = await supabase
    .from("locapass_shops")
    .select(
      "id, name, category, address, address_en, tel, business_hours, description, translations, cover_url, icon_url, url, tagline, line_url, site_id, gallery_image_urls",
    )
    .eq("id", shopId)
    .single();

  if (shopError && shopError.code !== "PGRST116") {
    throw new Error(`locapass_shops取得に失敗しました: ${shopError.message}`);
  }

  if (!shopRow) {
    notFound();
  }

  // 子ポータル(サイト)トップへ戻る導線用。site_idが無い店舗(旧データ等)では出さない。
  const { data: site } = shopRow.site_id
    ? await supabase.from("locapass_sites").select("slug, name").eq("id", shopRow.site_id).maybeSingle()
    : { data: null };

  const translatedDescription = pickTranslation(locale, shopRow.description, shopRow.translations, "description");
  const usedTranslation = translatedDescription.translated;

  const store: Store = {
    id: shopRow.id,
    name: shopRow.name,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはsite_idで分かれる)
    genre: shopRow.category,
    address: shopRow.address,
    phone: shopRow.tel,
    businessHours: shopRow.business_hours,
    priceInfo: null, // locapass_shopsに料金情報の列は無い
    description: translatedDescription.text,
    coverImageUrl: shopRow.cover_url ?? shopRow.icon_url,
    websiteUrl: shopRow.url,
    usageNotes: null,
    snsLinks: {},
    hero: {
      type: "image",
      url: shopRow.cover_url ?? shopRow.icon_url,
    },
    tagline: shopRow.tagline,
    lineContactUrl: shopRow.line_url,
    lineQrImageUrl: null,
    galleryImageUrls: shopRow.gallery_image_urls ?? [],
  };
  // 英語表示では住所もローマ字表記(address_en)にする。中国語の読者は漢字の住所が読めるので原文のまま。
  const addressDisplay = locale === "en" && shopRow.address_en ? shopRow.address_en : store.address;

  const [{ data: castMembers }, { data: priceItemRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("cast_members")
      .select("id, name, age, pr_text, avatar_url, created_at, media ( url, display_order )")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_price_items")
      .select("id, name, duration_minutes, price, name_translations")
      .eq("shop_id", shopId)
      .order("display_order", { ascending: true }),
    supabase
      .from("shop_events")
      .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, translations")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false }),
  ]);

  const castIds = castMembers?.map((c) => c.id) ?? [];

  const { data: activeStoryCastIds } = castIds.length
    ? await supabase.rpc("cast_ids_with_active_story", { p_cast_ids: castIds })
    : { data: [] as string[] };
  const activeStoryCastIdSet = new Set(activeStoryCastIds ?? []);
  const castsWithActiveStory = (castMembers ?? []).filter((c) => activeStoryCastIdSet.has(c.id));

  const { data: todaySchedules } = castIds.length
    ? await supabase
        .from("schedules")
        .select("cast_id, start_time, end_time")
        .in("cast_id", castIds)
        .eq("date", toJstDateString(getJstNow()))
        .eq("is_working_today", true)
    : { data: [] as { cast_id: string; start_time: string | null; end_time: string | null }[] };

  const shiftByCastId = new Map(
    (todaySchedules ?? []).map((s) => [
      s.cast_id,
      `${s.start_time ? s.start_time.slice(0, 5) : "--:--"} - ${s.end_time ? s.end_time.slice(0, 5) : "LAST"}`,
    ]),
  );

  // ヒーロー直下の横スワイプ帯: 各キャストの最新リール1本ずつだけ。
  const { data: castReelRows } = castIds.length
    ? await supabase
        .from("reels")
        .select("id, media, cast_id, cast_members ( name )")
        .in("cast_id", castIds)
        .eq("status", "published")
        // ストーリーはRLS上フォロワーには読めるので、リール帯に混ざらないよう明示的に除外する。
        .eq("post_type", "reel")
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  type CastReelPreview = {
    id: string;
    castId: string;
    castName: string;
    thumbUrl: string | null;
    videoUrl: string | null;
  };
  const seenReelCastIds = new Set<string>();
  const castReelPreviews: CastReelPreview[] = [];
  for (const row of castReelRows ?? []) {
    if (!row.cast_id || seenReelCastIds.has(row.cast_id)) continue;
    const media = (row.media as { type: "image" | "video"; url: string; poster?: string }[])[0];
    if (!media) continue;
    const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
    seenReelCastIds.add(row.cast_id);
    castReelPreviews.push({
      id: row.id,
      castId: row.cast_id,
      castName: cast?.name ?? "",
      thumbUrl: media.type === "video" ? (media.poster ?? null) : media.url,
      videoUrl: media.type === "video" ? media.url : null,
    });
  }

  const now = Date.now();
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  const castsUnshuffled: Cast[] = (castMembers ?? []).map((c) => {
    const media = [...(c.media ?? [])].sort((a, b) => a.display_order - b.display_order);
    return {
      id: c.id,
      name: c.name,
      age: c.age,
      prText: c.pr_text,
      photoUrl: media[0]?.url,
      isWorkingToday: shiftByCastId.has(c.id),
      shiftLabel: shiftByCastId.get(c.id) ?? null,
      isNew: now - new Date(c.created_at).getTime() <= TWO_WEEKS_MS,
    };
  });
  // 在籍一覧の表示順は毎回ランダムにする(特定のキャストが常に先頭に固定されないように)。
  const casts = shuffle(castsUnshuffled);

  const todayCasts = casts.filter((c) => c.isWorkingToday);

  const priceItems: PriceItem[] = (priceItemRows ?? []).map((p) => ({
    id: p.id,
    name: pickTranslation(locale, p.name, p.name_translations, "name").text ?? p.name,
    durationMinutes: p.duration_minutes,
    price: p.price,
  }));
  const events: ShopEvent[] = (eventRows ?? [])
    .filter((e) => !e.ends_at || new Date(e.ends_at).getTime() >= now)
    .map((e) => ({
      id: e.id,
      title: pickTranslation(locale, e.title, e.translations, "title").text ?? e.title,
      body: pickTranslation(locale, e.body, e.translations, "body").text,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      imageUrl: e.image_url,
      galleryImageUrls: e.gallery_image_urls ?? [],
      isEnded: false,
    }));

  const hasPriceSection = priceItems.length > 0 || events.length > 0;

  const shopUrl = `https://reels.locapass.net/shops/${store.id}`;

  // locapass_shops.categoryはサイトごとの自由入力(観光・飲食・宿泊等)なので、
  // LUXELA側のようなジャンル別スキーマ判定はせず汎用のLocalBusinessにする。
  const schemaType = "LocalBusiness";

  const breadcrumbItems: { name: string; item: string }[] = [
    { name: "ホーム", item: "https://reels.locapass.net" },
    { name: store.name, item: shopUrl },
  ];

  return (
    <div className="space-y-10 pb-44 md:pb-24">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": schemaType,
          name: store.name,
          description: store.tagline ?? store.description ?? undefined,
          image: store.hero.url ?? undefined,
          url: shopUrl,
          telephone: store.phone ?? undefined,
          address: store.address
            ? {
                "@type": "PostalAddress",
                streetAddress: store.address,
                addressCountry: "JP",
              }
            : undefined,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbItems.map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: b.name,
            item: b.item,
          })),
        }}
      />
      {/* モバイルは固定のフローティングアクションバー(ShopSectionNav)+ボトムナビが二重に
          画面下に重なるため、最後のコンテンツがその下に隠れないよう大きめの余白を確保する。
          PCはボトムナビが無く、ShopSectionNavもmd:bottom-6と控えめなので余白は少なくてよい。 */}
      {site && (
        <Link href={`/${site.slug}`} className="block px-4 pt-4 text-sm text-brand hover:underline sm:px-6">
          {t.shop.backToSite(site.name)}
        </Link>
      )}
      {/* 1. トップヒーローセクション */}
      <section className="relative -mt-px h-[300px] w-full overflow-hidden sm:h-[380px]">
        {store.hero.url ? (
          store.hero.type === "video" ? (
            <video
              src={store.hero.url}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              autoPlay
              loop
              muted
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.hero.url}
              alt={store.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-900" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6">
          <p className="text-[11px] tracking-[0.2em] text-amber-300/80">
            {store.area ?? t.shop.areaNotSet} / {store.genre ? genreLabel(locale, store.genre) : t.shop.genreNotSet}
          </p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-wide text-white drop-shadow-lg sm:text-4xl">
            {store.name}
          </h1>
          {store.tagline && (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-amber-100/80">{store.tagline}</p>
          )}
          <ShopFollowButton shopId={store.id} />
        </div>
      </section>

      {/* ストーリー(24時間で消える、フォロワー限定の投稿)を持つキャストだけ丸型で表示。
          未フォローで押すとフォローを促す案内が出る(コンポーネント側で処理)。 */}
      {castsWithActiveStory.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:px-6">
          {castsWithActiveStory.map((c) => (
            <StoryRing key={c.id} castId={c.id} castName={c.name} avatarUrl={c.avatar_url} />
          ))}
        </div>
      )}

      {/* ヒーロー直下: 各キャストの最新リールを横スワイプで。タイトル等は出さずサムネイルのみ。 */}
      {castReelPreviews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:px-6">
          {castReelPreviews.map((r) => (
            <Link
              key={r.id}
              href={`/shops/${store.id}/reels?start=${r.id}`}
              className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-900"
            >
              {r.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbUrl} alt={r.castName} className="h-full w-full object-cover" />
              ) : r.videoUrl ? (
                <video
                  src={`${r.videoUrl}#t=0.001`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
              <span className="absolute bottom-1 left-1 right-1 truncate text-[10px] text-white drop-shadow">
                {r.castName}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-10 px-4 sm:px-6">
        {/* 2. 在籍キャスト/本日の出勤ギャラリー(最優先配置)。
            未入力のセクションは見出しごと出さない。見出しだけ残ると「更新をサボっている店」に見えるうえ、
            キャストのいない業種(アフターの飲食店など)でも同じページを使えるようにするため。 */}
        {todayCasts.length > 0 && (
        <section id="today" className="scroll-mt-24 space-y-6">
          <SectionHeading
            eyebrow="TODAY'S CAST"
            title={t.shop.todaySchedule}
            subtitle={t.shop.todaySubtitle}
          />
            <div className="flex items-start gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar py-1">
              {todayCasts.map((cast) => (
                <Link
                  key={cast.id}
                  href={`/cast/${cast.id}`}
                  className="flex min-w-[72px] flex-col items-center gap-1 snap-start group"
                >
                  <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 p-[2px] transition group-hover:scale-105">
                    <div className="rounded-full bg-black p-[2px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cast.photoUrl || "https://via.placeholder.com/150"}
                        alt={cast.name}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    </div>
                  </div>
                  <span className="max-w-[68px] truncate text-center text-xs text-neutral-300 group-hover:text-white">
                    {cast.name}
                  </span>
                </Link>
              ))}
            </div>
        </section>
        )}

        {casts.length > 0 && (
        <section id="cast" className="scroll-mt-24 space-y-6">
          <SectionHeading eyebrow="ALL CAST" title={t.shop.allCast} icon={<Users size={14} />} />
            <>
              {/* モバイル: 9人ずつ(3列×3行)を1ページとして横スワイプでページ送り。
                  grid-auto-flow:column + パーセンテージ auto-cols はSafari(iOS)で
                  幅の解決が不安定だったため、flexboxで「ページ(100%幅)を横に並べ、
                  各ページの中は普通の3列グリッド」という単純な構造にしている。 */}
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 no-scrollbar md:hidden">
                {chunk(casts, 9).map((page, pageIndex) => (
                  <div key={pageIndex} className="grid w-full flex-none grid-cols-3 gap-1.5 snap-start">
                    {page.map((cast) => (
                      <CastCard
                        key={cast.id}
                        id={cast.id}
                        name={cast.name}
                        age={cast.age}
                        prText={cast.prText}
                        photoUrl={cast.photoUrl}
                        shiftLabel={cast.isWorkingToday ? cast.shiftLabel : null}
                        isNew={cast.isNew}
                        dense
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* PC/iPad: 折り返しグリッドだと在籍数が多い店舗でページが際限なく縦に伸びる
                  (在籍100人規模だと特に致命的)ため、モバイルと同じく1ページ分だけ描画して
                  横スワイプでページ送りする構造に揃える。 */}
              <div className="hidden gap-3 overflow-x-auto snap-x snap-mandatory pb-1 no-scrollbar md:flex">
                {chunk(casts, 15).map((page, pageIndex) => (
                  <div key={pageIndex} className="grid w-full flex-none grid-cols-5 gap-2 snap-start">
                    {page.map((cast) => (
                      <CastCard
                        key={cast.id}
                        id={cast.id}
                        name={cast.name}
                        age={cast.age}
                        prText={cast.prText}
                        photoUrl={cast.photoUrl}
                        shiftLabel={cast.isWorkingToday ? cast.shiftLabel : null}
                        isNew={cast.isNew}
                        dense
                      />
                    ))}
                  </div>
                ))}
              </div>
            </>
        </section>
        )}

        {/* 3. 店舗基本情報 */}
        <section id="access" className="scroll-mt-24 space-y-4">
          {store.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
              {store.description}
            </p>
          )}
          {usedTranslation && <p className="text-[11px] text-neutral-500">{t.shop.autoTranslated}</p>}

          {store.galleryImageUrls.length > 0 && (
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
              {store.galleryImageUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-32 w-24 flex-none snap-start rounded-lg border border-white/10 object-cover"
                />
              ))}
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-5 shadow-2xl backdrop-blur-xl">
            {store.address && (
              <InfoRow icon={<MapPin size={16} />} label={t.shop.address} value={addressDisplay ?? store.address} />
            )}
            {store.phone && <InfoRow icon={<Phone size={16} />} label={t.shop.phone} value={store.phone} />}
            {store.businessHours && (
              <InfoRow icon={<Clock size={16} />} label={t.shop.businessHours} value={store.businessHours} />
            )}
            {store.priceInfo && (
              <InfoRow icon={<DollarSign size={16} />} label={t.shop.priceInfo} value={store.priceInfo} />
            )}
          </div>

          {/* 住所と連動した地図。未入力の店舗では非表示。
              Google Maps Embed APIキーが無い環境でも動く従来のq=埋め込みを使い、
              CSSフィルタでダーク×ゴールドの世界観に馴染むトーンに変換している。
              iframeはpointer-events-noneにして、カード全体のタップでGoogleマップアプリ/
              サイトへ直接遷移させる(ルート案内ボタンも別途下に用意)。 */}
          {store.address && (
            <div className="overflow-hidden rounded-2xl border border-amber-500/20 shadow-2xl">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${store.name}の地図をGoogleマップで開く`}
                className="relative block h-44 w-full overflow-hidden bg-zinc-900"
              >
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(store.address)}&z=16&output=embed&hl=${mapsHl}`}
                  title={`${store.name}の地図`}
                  loading="lazy"
                  tabIndex={-1}
                  className="pointer-events-none h-[calc(100%+80px)] w-full -translate-y-10 border-0 [filter:invert(92%)_hue-rotate(180deg)_brightness(0.9)_contrast(1.05)_saturate(0.8)]"
                />
                {/* Googleロゴ等の帯を上下に隠す */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-zinc-900" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-zinc-900" />
              </a>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border-t border-amber-500/20 bg-zinc-900/90 px-4 py-3 text-sm font-medium text-neutral-300 transition hover:bg-zinc-800 hover:text-neutral-100"
              >
                <Navigation size={16} />
                {t.shop.routeGuide}
              </a>
            </div>
          )}

          <InquiryButton shopId={store.id} shopName={store.name} />

          {/* リンク・SNS */}
          {(store.websiteUrl || store.snsLinks.x || store.snsLinks.instagram || store.snsLinks.line) && (
            <div className="flex flex-wrap gap-2">
              {store.websiteUrl && (
                <LinkPill href={store.websiteUrl} icon={<Globe size={14} />} label={t.shop.officialSite} />
              )}
              {store.snsLinks.x && (
                <LinkPill href={store.snsLinks.x} icon={<AtSign size={14} />} label="X" />
              )}
              {store.snsLinks.instagram && (
                <LinkPill href={store.snsLinks.instagram} icon={<Camera size={14} />} label="Instagram" />
              )}
              {store.snsLinks.line && (
                <LinkPill href={store.snsLinks.line} icon={<MessageCircle size={14} />} label="LINE" />
              )}
            </div>
          )}

          {/* 4. ご利用にあたって */}
          {store.usageNotes && (
            <div className="rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-5 shadow-2xl backdrop-blur-xl">
              <p className="text-xs font-semibold text-amber-300/70">{t.shop.usageNotes}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{store.usageNotes}</p>
            </div>
          )}
        </section>

        {/* 料金表・イベント */}
        {hasPriceSection && (
        <section id="price" className="scroll-mt-24 space-y-3">
          {priceItems.length > 0 && (
            <ShopAccordion title={t.shop.priceList} icon={<Star size={16} className="text-amber-400" />} defaultOpen>
              <ul className="divide-y divide-amber-500/10">
                {priceItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-neutral-200">
                      {item.name}
                      {item.durationMinutes ? (
                        <span className="ml-1 text-neutral-500">{t.featured.minutes(item.durationMinutes)}</span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-amber-300">¥{item.price.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </ShopAccordion>
          )}

          {events.length > 0 && (
            <ShopAccordion title={t.shop.eventAnnouncement} icon={<CalendarDays size={16} className="text-amber-400" />}>
              <ul className="space-y-4">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    {e.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.imageUrl}
                        alt={e.title}
                        className="h-16 w-12 shrink-0 rounded-lg border border-amber-500/20 object-cover"
                      />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">
                        {e.title}
                        {formatEventDateRange(e) && (
                          <span className="ml-2 text-xs text-neutral-500">{formatEventDateRange(e)}</span>
                        )}
                      </p>
                      {e.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-400">{e.body}</p>
                      )}
                      {e.galleryImageUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {e.galleryImageUrls.map((u) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={u}
                              src={u}
                              alt=""
                              className="h-14 w-14 rounded-lg border border-amber-500/20 object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ShopAccordion>
          )}
        </section>
        )}
      </div>

      <ShopSectionNav
        phone={store.phone}
        lineContactUrl={store.lineContactUrl}
        lineQrImageUrl={store.lineQrImageUrl}
        sections={[
          ...(todayCasts.length > 0 ? ["today"] : []),
          ...(casts.length > 0 ? ["cast"] : []),
          ...(hasPriceSection ? ["price"] : []),
          "access",
        ]}
      />
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-amber-400/80">{icon}</span>
      <div>
        <p className="text-[11px] text-amber-200/50">{label}</p>
        <p className="text-neutral-200">{value}</p>
      </div>
    </div>
  );
}

function LinkPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-4 py-2 text-xs font-bold text-black shadow-lg transition hover:brightness-110"
    >
      {icon}
      {label}
      <ExternalLink size={12} />
    </a>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <p className="flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] text-amber-400/60">
        {icon}
        ── {eyebrow} ──
      </p>
      <h2 className="font-display mt-1 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-2xl font-bold text-transparent">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-xs text-neutral-400">{subtitle}</p>}
    </div>
  );
}
