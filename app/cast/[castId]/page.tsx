import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CastFollowHeart } from "@/components/CastFollowHeart";
import { CastFollowBadge } from "@/components/CastFollowBadge";
import { CastPhotoGrid } from "@/components/CastPhotoGrid";
import { StoryRing } from "@/components/StoryRing";
import { JsonLd } from "@/components/JsonLd";
import { StreamThumb } from "@/components/video/StreamThumb";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";

// トップページと同じ60秒キャッシュ。長押しプレビュー(iframe埋め込み)で毎回フルSSRを
// 待たされる体感の遅さを緩和する(初回以外はキャッシュから即座に返る)。
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ castId: string }>;
}): Promise<Metadata> {
  const { castId } = await params;
  const supabase = await createClient();
  const { data: cast } = await supabase
    .from("locapass_public_casts")
    .select("name, age, pr_text, avatar_url, shops:locapass_shops ( name, area, genre:category )")
    .eq("id", castId)
    .single();

  if (!cast) {
    return { title: "パートナーが見つかりません | LOCAPASS" };
  }
  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const title = `${cast.name}${cast.age ? `(${cast.age})` : ""}｜${shop?.name ?? "LOCAPASS"}のパートナー`;
  const description =
    cast.pr_text?.slice(0, 120) ||
    `${shop?.area ?? ""}${shop?.genre ?? ""}「${shop?.name ?? ""}」在籍、${cast.name}のプロフィール・出勤情報・投稿リール。`;
  const url = `https://reels.locapass.net/cast/${castId}`;
  const image = sanitizeImageUrl(cast.avatar_url);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "LOCAPASS", images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function CastDetailPage({
  params,
}: {
  params: Promise<{ castId: string }>;
}) {
  const { castId } = await params;
  const supabase = await createClient();
  const locale = await getServerLocale();
  const t = dictionaries[locale];

  // castの存在チェックに使うクエリと、それ以外の4つは互いに依存しない
  // (すべてcastIdだけで絞り込める)ため、直列に待たず最初から並列で投げる。
  // モーダルプレビュー(iframe埋め込み)でのタップ後の表示待ちを縮めるための最適化。
  const [
    { data: cast, error: castError },
    { data: media },
    { data: schedules },
    { data: diaryEntries },
    { data: reels },
    { data: activeStoryCastIds },
  ] = await Promise.all([
    supabase
      .from("locapass_public_casts")
      .select(
        "id, name, age, sizes, pr_text, avatar_url, shop_id, created_at, updated_at, shops:locapass_shops ( id, name, area, genre:category )",
      )
      .eq("id", castId)
      .single(),
    supabase
      .from("locapass_media")
      .select("id, url, display_order")
      .eq("cast_id", castId)
      .order("display_order", { ascending: true }),
    supabase
      .from("locapass_schedules")
      .select("id, date, start_time, end_time, is_working_today")
      .eq("cast_id", castId)
      .gte("date", toJstDateString(getJstNow()))
      .order("date", { ascending: true })
      .limit(7),
    supabase
      .from("locapass_cast_diary_entries")
      .select("id, title, body, created_at")
      .eq("cast_id", castId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("locapass_reels")
      .select(`id, ${LOCAPASS_REEL_MEDIA_SELECT}, likes_count:like_count, pinned_at`)
      .eq("cast_id", castId)
      .eq("status", "publish")
      // ストーリー(24時間)は明示的に除外する。
      .eq("reel_type", "permanent")
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false }),
    supabase.rpc("locapass_cast_ids_with_active_story", { p_cast_ids: [castId] }),
  ]);

  const hasActiveStory = (activeStoryCastIds ?? []).length > 0;

  if (castError && castError.code !== "PGRST116") {
    throw new Error(`locapass_public_casts取得に失敗しました: ${castError.message}`);
  }

  if (!cast) {
    notFound();
  }

  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const sizes = cast.sizes as { t?: string; b?: string; w?: string; h?: string } | null;
  const reelItems = (reels ?? []).map((r) => ({ ...r, media: toReelMedia(r) }));
  const postCount = reelItems.length;
  const totalLikes = reelItems.reduce((sum, r) => sum + r.likes_count, 0);

  const breadcrumbItems = [
    { name: "ホーム", item: "https://reels.locapass.net" },
    ...(shop ? [{ name: shop.name, item: `https://reels.locapass.net/shops/${shop.id}` }] : []),
    { name: cast.name, item: `https://reels.locapass.net/cast/${castId}` },
  ];

  // 店舗ページ(app/shops/[shopId]/page.tsx)と同じ判定基準(コンカフェのみ業態を分ける)。
  const worksForSchemaType = shop?.genre === "コンカフェ" ? "CafeOrCoffeeShop" : "NightClub";
  const castUrl = `https://reels.locapass.net/cast/${castId}`;
  // sizes.t は「身長(cm)」の自由入力欄のため、数値として読み取れる場合だけ構造化データに含める。
  const heightCm = sizes?.t ? Number(sizes.t.replace(/[^0-9.]/g, "")) : NaN;

  return (
    <div className="space-y-8 pb-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          dateCreated: cast.created_at,
          dateModified: cast.updated_at,
          mainEntity: {
            "@type": "Person",
            "@id": `${castUrl}#person`,
            identifier: cast.id,
            name: cast.name,
            image: sanitizeImageUrl(cast.avatar_url),
            description:
              cast.pr_text?.slice(0, 200) ||
              `${shop?.name ?? "LOCAPASS"}所属のパートナー「${cast.name}」のプロフィール`,
            jobTitle: "パートナー",
            url: castUrl,
            worksFor: shop
              ? {
                  "@type": worksForSchemaType,
                  name: shop.name,
                  url: `https://reels.locapass.net/shops/${shop.id}`,
                  address: shop.area
                    ? { "@type": "PostalAddress", addressLocality: shop.area, addressCountry: "JP" }
                    : undefined,
                }
              : undefined,
            ...(Number.isFinite(heightCm) && heightCm > 0
              ? { height: { "@type": "QuantitativeValue", value: heightCm, unitCode: "CMT" } }
              : {}),
          },
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
      {shop && (
        <Link href={`/shops/${shop.id}`} className="text-sm text-brand hover:underline">
          {t.cast.backToShop(shop.name)}
        </Link>
      )}

      {/* プロフィールヘッダー(Instagramのプロフィール画面と同じ構成、閲覧専用) */}
      <section className="px-1">
        <div className="flex items-center gap-4">
          {/* 左: アイコン */}
          <div className="relative shrink-0">
            {hasActiveStory ? (
              <StoryRing castId={cast.id} castName={cast.name} avatarUrl={cast.avatar_url} size="lg" showLabel={false} />
            ) : cast.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sanitizeImageUrl(cast.avatar_url)}
                alt=""
                className="h-20 w-20 rounded-full border border-main/10 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-main/10 bg-tone-800 text-2xl font-semibold text-tone-500">
                {cast.name.slice(0, 1)}
              </div>
            )}
            <CastFollowBadge castId={cast.id} />
          </div>

          {/* 右: 名前・店舗・スタッツ */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">
              {cast.name}
              {cast.age != null && <span className="ml-2 text-base text-main/50">{t.cast.age(cast.age)}</span>}
            </h1>
            {shop && <p className="truncate text-xs text-muted">{shop.name} ・ {shop.area}</p>}

            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-base font-bold">{postCount}</p>
                <p className="text-[11px] text-muted">{t.common.posts}</p>
              </div>
              <div>
                <p className="text-base font-bold">{totalLikes}</p>
                <p className="text-[11px] text-muted">{t.common.likes}</p>
              </div>
              <div>
                <div className="flex h-6 items-center">
                  <CastFollowHeart castId={cast.id} size={18} />
                </div>
                <p className="text-[11px] text-muted">{t.common.follow}</p>
              </div>
            </div>
          </div>
        </div>

        {sizes && (
          <p className="mt-4 text-sm text-muted">
            T{sizes.t ?? "-"} / B{sizes.b ?? "-"} W{sizes.w ?? "-"} H{sizes.h ?? "-"}
          </p>
        )}

        {cast.pr_text && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-tone-300">
            {cast.pr_text}
          </p>
        )}

        {shop && (
          <Link
            href={`/shops/${shop.id}`}
            className="mt-4 block w-full rounded-lg bg-brand px-6 py-2 text-center text-sm font-semibold text-main hover:bg-brand-dark"
          >
            {t.common.seeShopPage}
          </Link>
        )}
      </section>

      {/* キャストギャラリー(1列の横スワイプ)。リール一覧の上に置く。 */}
      {media && media.length > 0 && (
        <section className="px-1">
          <h2 className="mb-3 text-sm font-bold text-tone-300">{t.cast.photos}</h2>
          <CastPhotoGrid photos={media} castName={cast.name} />
        </section>
      )}

      {/* 投稿グリッド(リール)。タップすると、このキャストの投稿だけを対象にした
          縦スワイプのリール再生(/cast/[castId]/reels)がタップした投稿から始まる。
          投稿・出勤・日記は未入力なら見出しごと出さない(「まだありません」が並ぶとサボっているように見えるため)。 */}
      {reelItems.length > 0 && (
      <section>
        <div className="grid grid-cols-3 gap-1 border-t border-main/10 pt-1">
          {reelItems.map((r) => {
            const item = (r.media as { type: "video" | "image"; url: string }[])[0];
            return (
              <Link
                key={r.id}
                href={`/cast/${castId}/reels?start=${r.id}`}
                className="relative block aspect-[9/16] overflow-hidden bg-surface"
              >
                {item?.type === "video" ? (
                  <StreamThumb url={item.url} className="h-full w-full object-cover" />
                ) : item ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {r.pinned_at && (
                  <span data-surface="media" className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-accent">
                    <Pin size={11} className="fill-accent" />
                  </span>
                )}
                <span data-surface="media" className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-main">
                  <Heart size={10} className="fill-main" /> {r.likes_count}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      )}

      {schedules && schedules.length > 0 && (
      <section className="px-1">
        <h2 className="mb-3 text-sm font-bold text-tone-300">{t.cast.schedule}</h2>
          <ul className="divide-y divide-main/10 rounded-lg border border-main/10 bg-surface">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{s.date}</span>
                <span className="text-muted">
                  {s.is_working_today
                    ? `${s.start_time ?? "--:--"} 〜 ${s.end_time ?? "--:--"}`
                    : t.cast.dayOff}
                </span>
              </li>
            ))}
          </ul>
      </section>
      )}

      {diaryEntries && diaryEntries.length > 0 && (
      <section className="px-1">
        <h2 className="mb-3 text-sm font-bold text-tone-300">{t.cast.diary}</h2>
          <ul className="space-y-4">
            {diaryEntries.map((d) => (
              <li key={d.id} className="rounded-lg border border-main/10 bg-surface p-4">
                <p className="font-semibold">{d.title || t.cast.untitled}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tone-300">
                  {d.body}
                </p>
                <p className="mt-2 text-xs text-tone-500">
                  {new Date(d.created_at).toLocaleString(locale === "zh" ? "zh-CN" : locale)}
                </p>
              </li>
            ))}
          </ul>
      </section>
      )}
    </div>
  );
}
