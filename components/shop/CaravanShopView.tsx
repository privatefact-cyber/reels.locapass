import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  CalendarDays,
  Camera,
  ChevronLeft,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Play,
  AtSign,
  Utensils,
} from "lucide-react";
import { InquiryButton } from "@/components/InquiryButton";
import { ShopFollowButton } from "@/components/ShopFollowButton";
import { ShopHeroMedia } from "@/components/shop/ShopHeroMedia";
import { ShopVideo } from "@/components/shop/ShopVideo";
import { GalleryThumbs } from "@/components/shop/GalleryThumbs";
import { ShopUserPhotoGrid } from "@/components/shop/ShopUserPhotoGrid";
import { ShopItemsSection } from "@/components/shop/ShopItemsSection";
import { PlacePhotoCredit, isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";
import { genreLabel } from "@/lib/i18n/genreLabels";
import type { Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ShopItem } from "@/lib/shop/items";
import type { PriceItem, ShopEvent, SnsLinks } from "@/lib/types/shop";
import type { VideoRef } from "@/lib/video";

type ReelPreview = { id: string; castName: string; thumbUrl: string | null };

/**
 * 移動販売(Caravan)の店舗ページ。通常の店舗ページより「いまどこで何が食べられるか」を前に出し、
 * 大きなヒーロー動画・出店場所・メニュー・出店スケジュール・動画紹介・フォトギャラリーを縦に並べる。
 * データの取得は店舗ページ(page.tsx)側で行い、ここは見せ方だけを担当する。
 */
export function CaravanShopView({
  locale,
  t,
  portal,
  shop,
  video,
  heroUseYoutube,
  reels,
  userPhotos,
  priceItems,
  events,
  items,
  hrefs,
  attribution,
  spot,
}: {
  locale: Locale;
  t: Dictionary;
  portal: { slug: string; name: string; nameEn: string | null };
  shop: {
    id: string;
    slug: string;
    name: string;
    area: string | null;
    genre: string | null;
    tagline: string | null;
    description: string | null;
    address: string | null;
    phone: string | null;
    businessHours: string | null;
    priceInfo: string | null;
    usageNotes: string | null;
    websiteUrl: string | null;
    snsLinks: SnsLinks;
    heroUrl: string | null;
    heroType: "image" | "video";
    coverUrl: string | null;
    gallery: string[];
    lat: number | null;
    lng: number | null;
    usedTranslation: boolean;
  };
  video: VideoRef | null;
  heroUseYoutube: boolean;
  reels: ReelPreview[];
  userPhotos: ComponentProps<typeof ShopUserPhotoGrid>["posts"];
  priceItems: PriceItem[];
  events: ShopEvent[];
  items: ShopItem[];
  hrefs: { portal: string; reels: string; archive: string; photos: string; photoNew: string };
  attribution: { name?: string; uri?: string | null } | null;
  /** いま営業中、または次の出店予定(位置つきイベント)。無ければ登録住所を出す。 */
  spot: { kind: "live" | "next"; address: string | null; lat: number; lng: number; startsAt: string; endsAt: string } | null;
}) {
  const dest = spot ? `${spot.lat},${spot.lng}` : shop.lat != null && shop.lng != null ? `${shop.lat},${shop.lng}` : shop.address;
  const routeUrl = dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
  const mapQuery = dest ?? "";
  const mapsHl = locale === "zh" ? "zh-CN" : locale;
  const headline = shop.tagline ?? shop.genre ?? "";
  const hasMenu = priceItems.length > 0 || items.length > 0;

  return (
    <div className="space-y-12 pb-44 md:pb-24">
      {/* ── HERO ───────────────────────────────────────── */}
      <section className="relative -mt-px h-[460px] w-full overflow-hidden sm:h-[560px]">
        <ShopHeroMedia
          url={shop.heroUrl}
          type={shop.heroType}
          alt={shop.name}
          category={shop.genre}
          seed={shop.id}
          youtubeId={video?.provider === "youtube" ? video.ref : null}
          preferYoutube={heroUseYoutube}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-tone-950 via-tone-950/55 to-black/30" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,146,60,0.28),transparent_55%)]" />

        <Link
          href={hrefs.portal}
          className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-full border border-main/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-main/90 shadow-lg backdrop-blur-md transition hover:bg-black/60 sm:left-6 sm:top-6"
        >
          <ChevronLeft size={14} />
          <span>{locale !== "ja" && portal.nameEn ? portal.nameEn : portal.name}</span>
        </Link>

        {isPlacePhotoUrl(shop.heroUrl) && (
          <div className="absolute right-3 top-3 z-20 sm:right-6 sm:top-6">
            <PlacePhotoCredit attribution={attribution} />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-16 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-extrabold tracking-widest text-black shadow-lg">
              <Utensils size={12} /> KITCHEN CAR
            </span>
            {shop.genre && (
              <span className="rounded-full border border-main/30 bg-black/40 px-3 py-1 text-[11px] text-main/90 backdrop-blur-md">
                {genreLabel(locale, shop.genre)}
              </span>
            )}
            {shop.area && (
              <span className="rounded-full border border-main/30 bg-black/40 px-3 py-1 text-[11px] text-main/90 backdrop-blur-md">
                {shop.area}
              </span>
            )}
          </div>
          <h1 className="font-display mt-3 break-keep text-4xl font-bold leading-tight tracking-wide text-main drop-shadow-xl [overflow-wrap:anywhere] sm:text-5xl">
            <bdi>{shop.name}</bdi>
          </h1>
          {headline && (
            <p dir="auto" className="mt-2 max-w-lg text-base leading-relaxed text-hl-100/90">
              {headline}
            </p>
          )}
          <ShopFollowButton shopId={shop.id} />
        </div>
      </section>

      <div className="space-y-12 px-4 sm:px-6">
        {/* ── TODAY'S SPOT ─────────────────────────────── */}
        {(spot || shop.address || shop.businessHours) && (
          <section aria-label="出店場所" className="-mt-10 relative z-20 overflow-hidden rounded-3xl border border-orange-400/30 bg-panel-900/90 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-2 text-[11px] font-extrabold tracking-[0.25em] text-black">
              {spot?.kind === "live" ? <span className="h-2 w-2 animate-pulse rounded-full bg-black" /> : <MapPin size={13} />}
              {spot?.kind === "live" ? "NOW OPEN" : spot?.kind === "next" ? "NEXT" : "SPOT"}
              <span className="ml-auto font-bold tracking-normal">{spot?.kind === "live" ? "いま営業中" : spot?.kind === "next" ? "次の出店" : "出店場所"}</span>
            </div>
            <div className="space-y-3 p-5">
              {(spot?.address || shop.address) && (
                <p className="text-lg font-semibold leading-snug text-tone-100">{spot?.address || shop.address}</p>
              )}
              {spot && (
                <p className="flex items-start gap-2 text-sm text-tone-300">
                  <Clock size={15} className="mt-0.5 shrink-0 text-orange-400" />
                  {formatSpotRange(spot.startsAt, spot.endsAt)}
                </p>
              )}
              {!spot && shop.businessHours && (
                <p className="flex items-start gap-2 whitespace-pre-line text-sm text-tone-300">
                  <Clock size={15} className="mt-0.5 shrink-0 text-orange-400" />
                  {shop.businessHours}
                </p>
              )}
              {routeUrl && (
                <a
                  href={routeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-extrabold text-black shadow-lg transition hover:brightness-110"
                >
                  <Navigation size={16} /> {t.shop.routeGuide}
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── ACTIONS ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {shop.phone && <Pill href={`tel:${shop.phone}`} icon={<Phone size={14} />} label={shop.phone} />}
          {shop.snsLinks.instagram && <Pill href={shop.snsLinks.instagram} icon={<Camera size={14} />} label="Instagram" external />}
          {shop.snsLinks.x && <Pill href={shop.snsLinks.x} icon={<AtSign size={14} />} label="X" external />}
          {shop.snsLinks.line && <Pill href={shop.snsLinks.line} icon={<MessageCircle size={14} />} label="LINE" external />}
          {shop.websiteUrl && <Pill href={shop.websiteUrl} icon={<Globe size={14} />} label={t.shop.officialSite} external />}
        </div>

        {/* ── STORY ────────────────────────────────────── */}
        {shop.description && (
          <section className="space-y-3">
            <Heading eyebrow="ABOUT" title="このお店について" />
            <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-8 text-tone-200">
              {shop.description}
            </p>
            {shop.usedTranslation && <p className="text-[11px] text-tone-500">{t.shop.autoTranslated}</p>}
          </section>
        )}

        {/* ── MOVIE ────────────────────────────────────── */}
        {video && (
          <section className="space-y-3">
            <Heading eyebrow="MOVIE" title="動画で見る" icon={<Play size={14} />} />
            <div className="overflow-hidden rounded-3xl border border-orange-400/20 bg-black p-1.5 shadow-[0_20px_60px_-20px_rgba(251,146,60,0.45)]">
              <ShopVideo provider={video.provider} videoRef={video.ref} title={`${shop.name}の動画紹介`} posterUrl={shop.coverUrl} />
            </div>
          </section>
        )}

        {/* ── MENU ─────────────────────────────────────── */}
        {hasMenu && (
          <section id="price" className="scroll-mt-24 space-y-4">
            <Heading eyebrow="MENU" title="メニュー" icon={<Utensils size={14} />} />
            {priceItems.length > 0 && (
              <ul className="overflow-hidden rounded-3xl border border-line/20 bg-panel-900/70 p-2 shadow-2xl">
                {priceItems.map((p, i) => (
                  <li key={p.id} className="flex items-baseline gap-3 rounded-2xl px-4 py-3.5 odd:bg-white/[0.03]">
                    <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-orange-400/80">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-tone-100">
                      {p.name}
                      {p.durationMinutes ? <span className="ml-1 text-xs text-tone-500">{t.featured.minutes(p.durationMinutes)}</span> : null}
                    </span>
                    <span className="shrink-0 text-lg font-extrabold tabular-nums text-orange-300">¥{p.price.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            {shop.priceInfo && <p className="whitespace-pre-line px-1 text-xs text-tone-400">{shop.priceInfo}</p>}
            <ShopItemsSection items={items} totalCount={items.length} portalSlug={portal.slug} shopSlug={shop.slug} officialUrl={null} locale={locale} t={t.items} />
          </section>
        )}

        {/* ── SCHEDULE ─────────────────────────────────── */}
        {events.length > 0 && (
          <section className="space-y-4">
            <Heading eyebrow="SCHEDULE" title="出店スケジュール・お知らせ" icon={<CalendarDays size={14} />} />
            <ol className="relative space-y-4 border-l border-orange-400/30 pl-5">
              {[...events].sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? "")).map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-orange-400 bg-tone-950" />
                  <div className="flex gap-3 rounded-2xl border border-line/20 bg-panel-900/70 p-3">
                    {e.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.imageUrl} alt={e.title} className="h-20 w-16 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0">
                      {formatEventDateRange(e) && <p className="text-xs font-bold text-orange-300">{formatEventDateRange(e)}</p>}
                      <p className="text-sm font-semibold text-tone-100">{e.title}</p>
                      {e.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{e.body}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── GALLERY ──────────────────────────────────── */}
        {shop.gallery.length > 0 && (
          <section className="space-y-3">
            <Heading eyebrow="GALLERY" title="フォトギャラリー" icon={<Camera size={14} />} />
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:-mx-6 sm:px-6">
              <GalleryThumbs
                urls={shop.gallery}
                alt={shop.name}
                thumbClassName="h-56 w-44 flex-none snap-start rounded-2xl border border-main/10 shadow-xl sm:h-72 sm:w-56"
              />
            </div>
          </section>
        )}

        {/* ── REELS ────────────────────────────────────── */}
        {reels.length > 0 && (
          <section className="space-y-3">
            <Heading eyebrow="REELS" title="リール" />
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {reels.map((r) => (
                <Link
                  key={r.id}
                  href={`${hrefs.reels}?start=${r.id}`}
                  data-surface="media"
                  className="relative aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-xl bg-surface"
                >
                  {r.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbUrl} alt={r.castName} className="h-full w-full object-cover" />
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                </Link>
              ))}
              <Link href={hrefs.archive} className="flex aspect-[9/16] w-24 shrink-0 items-end justify-center pb-2">
                <span className="border-b border-hl-300/50 pb-0.5 text-[11px] tracking-wider text-tone-300 hover:text-hl-300">{t.shop.archiveAllReels}</span>
              </Link>
            </div>
          </section>
        )}

        {/* ── みんなの写真 ───────────────────────────────── */}
        {userPhotos.length > 0 ? (
          <section className="space-y-3">
            <Heading eyebrow="PHOTOS & VIDEOS" title={t.shop.userPhotosTitle} icon={<Camera size={14} />} />
            <ShopUserPhotoGrid posts={userPhotos.slice(0, 12)} layout="slider" shareUrl={hrefs.photos} />
            <Link href={hrefs.photos} className="block text-center text-xs text-accent underline">
              {t.shop.userPhotosAll}({t.shop.userPhotosCount(userPhotos.length)})
            </Link>
          </section>
        ) : null}
        <Link
          href={hrefs.photoNew}
          className="block rounded-2xl border border-dashed border-orange-400/30 px-4 py-3 text-center text-xs text-tone-400 transition hover:border-orange-400/60 hover:text-main"
        >
          {t.photo.postToShopButton}
        </Link>

        {/* ── ACCESS ───────────────────────────────────── */}
        <section id="access" className="scroll-mt-24 space-y-4">
          <Heading eyebrow="ACCESS" title="場所・お問い合わせ" icon={<MapPin size={14} />} />
          {mapQuery && (
            <div className="overflow-hidden rounded-3xl border border-line/20 shadow-2xl">
              <a
                href={routeUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${shop.name}の地図をGoogleマップで開く`}
                className="relative block h-56 w-full overflow-hidden bg-panel-900"
              >
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed&hl=${mapsHl}`}
                  title={`${shop.name}の地図`}
                  loading="lazy"
                  tabIndex={-1}
                  className="pointer-events-none h-[calc(100%+80px)] w-full -translate-y-10 border-0 [filter:invert(92%)_hue-rotate(180deg)_brightness(0.9)_contrast(1.05)_saturate(0.8)]"
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-panel-900" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-panel-900" />
              </a>
              {routeUrl && (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-t border-line/20 bg-panel-900/90 px-4 py-3 text-sm font-medium text-tone-300 hover:bg-panel-800 hover:text-tone-100">
                  <Navigation size={16} /> {t.shop.routeGuide}
                </a>
              )}
            </div>
          )}
          <InquiryButton shopId={shop.id} shopName={shop.name} />
          {shop.usageNotes && (
            <div className="rounded-2xl border border-line/20 bg-panel-900/60 p-5">
              <p className="text-xs font-semibold text-orange-300/80">{t.shop.usageNotes}</p>
              <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm text-tone-300">{shop.usageNotes}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Heading({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] text-orange-400/80">
        {icon}
        {eyebrow}
      </p>
      <h2 className="font-display mt-1 text-2xl font-bold text-tone-50">{title}</h2>
    </div>
  );
}

function Pill({ href, icon, label, external }: { href: string; icon: ReactNode; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-200 transition hover:bg-orange-500/20"
    >
      {icon}
      {label}
      {external && <ExternalLink size={12} />}
    </a>
  );
}

function formatSpotRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string, withDate: boolean) =>
    new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", ...(withDate ? { month: "numeric", day: "numeric", weekday: "short" } : {}), hour: "2-digit", minute: "2-digit" });
  const sameDay = new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
  return `${fmt(startsAt, true)} 〜 ${fmt(endsAt, !sameDay)}`;
}
