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
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";

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
    .from("cast_members")
    .select("name, age, pr_text, avatar_url, shops ( name, area, genre )")
    .eq("id", castId)
    .single();

  if (!cast) {
    return { title: "キャストが見つかりません | LOCAPASS" };
  }
  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const title = `${cast.name}${cast.age ? `(${cast.age})` : ""}｜${shop?.name ?? "LOCAPASS"}のキャスト`;
  const description =
    cast.pr_text?.slice(0, 120) ||
    `${shop?.area ?? ""}${shop?.genre ?? ""}「${shop?.name ?? ""}」在籍、${cast.name}のプロフィール・出勤情報・投稿リール。`;
  const url = `https://reels.locapass.net/cast/${castId}`;
  const image = cast.avatar_url ?? undefined;

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
      .from("cast_members")
      .select(
        "id, name, age, sizes, pr_text, avatar_url, shop_id, created_at, updated_at, shops ( id, name, area, genre )",
      )
      .eq("id", castId)
      .single(),
    supabase
      .from("media")
      .select("id, url, display_order")
      .eq("cast_id", castId)
      .order("display_order", { ascending: true }),
    supabase
      .from("schedules")
      .select("id, date, start_time, end_time, is_working_today")
      .eq("cast_id", castId)
      .gte("date", toJstDateString(getJstNow()))
      .order("date", { ascending: true })
      .limit(7),
    supabase
      .from("cast_diary_entries")
      .select("id, title, body, created_at")
      .eq("cast_id", castId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reels")
      .select("id, media, likes_count, pinned_at")
      .eq("cast_id", castId)
      .eq("status", "published")
      // ストーリー(フォロワー限定・24時間)はRLS上フォロワー本人には読めてしまうので、明示的に除外する。
      .eq("post_type", "reel")
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.rpc("cast_ids_with_active_story", { p_cast_ids: [castId] }),
  ]);

  const hasActiveStory = (activeStoryCastIds ?? []).length > 0;

  if (castError && castError.code !== "PGRST116") {
    throw new Error(`cast_members取得に失敗しました: ${castError.message}`);
  }

  if (!cast) {
    notFound();
  }

  const shop = Array.isArray(cast.shops) ? cast.shops[0] : cast.shops;

  const sizes = cast.sizes as { t?: string; b?: string; w?: string; h?: string } | null;
  const reelItems = reels ?? [];
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
            image: cast.avatar_url ?? undefined,
            description:
              cast.pr_text?.slice(0, 200) ||
              `${shop?.name ?? "LOCAPASS"}所属のキャスト「${cast.name}」のプロフィール`,
            jobTitle: "キャスト",
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
      <section className="px-1 text-center">
        <div className="relative mx-auto inline-block">
          {hasActiveStory ? (
            <StoryRing castId={cast.id} castName={cast.name} avatarUrl={cast.avatar_url} size="lg" showLabel={false} />
          ) : cast.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cast.avatar_url}
              alt=""
              className="h-20 w-20 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-neutral-800 text-2xl font-semibold text-neutral-500">
              {cast.name.slice(0, 1)}
            </div>
          )}
          <CastFollowBadge castId={cast.id} />
        </div>

        <h1 className="mt-3 text-lg font-bold">
          {cast.name}
          {cast.age != null && <span className="ml-2 text-base text-white/50">{t.cast.age(cast.age)}</span>}
        </h1>
        {shop && <p className="text-xs text-neutral-400">{shop.name} ・ {shop.area}</p>}

        <div className="mt-4 flex justify-center gap-8">
          <div className="text-center">
            <p className="text-base font-bold">{postCount}</p>
            <p className="text-[11px] text-neutral-400">{t.common.posts}</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold">{totalLikes}</p>
            <p className="text-[11px] text-neutral-400">{t.common.likes}</p>
          </div>
          <div className="text-center">
            <div className="flex h-6 items-center justify-center">
              <CastFollowHeart castId={cast.id} size={18} />
            </div>
            <p className="text-[11px] text-neutral-400">{t.common.follow}</p>
          </div>
        </div>

        {sizes && (
          <p className="mt-3 text-sm text-neutral-400">
            T{sizes.t ?? "-"} / B{sizes.b ?? "-"} W{sizes.w ?? "-"} H{sizes.h ?? "-"}
          </p>
        )}

        {cast.pr_text && (
          <p className="mx-auto mt-3 max-w-xs whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {cast.pr_text}
          </p>
        )}

        {shop && (
          <Link
            href={`/shops/${shop.id}`}
            className="mt-4 inline-block rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {t.common.seeShopPage}
          </Link>
        )}
      </section>

      {/* 投稿グリッド(リール)。タップすると、このキャストの投稿だけを対象にした
          縦スワイプのリール再生(/cast/[castId]/reels)がタップした投稿から始まる。
          投稿・出勤・日記は未入力なら見出しごと出さない(「まだありません」が並ぶとサボっているように見えるため)。 */}
      {reelItems.length > 0 && (
      <section>
        <div className="grid grid-cols-3 gap-1 border-t border-white/10 pt-1">
          {reelItems.map((r) => {
            const item = (r.media as { type: "video" | "image"; url: string }[])[0];
            return (
              <Link
                key={r.id}
                href={`/cast/${castId}/reels?start=${r.id}`}
                className="relative block aspect-[9/16] overflow-hidden bg-neutral-900"
              >
                {item?.type === "video" ? (
                  <video src={item.url} className="h-full w-full object-cover" muted />
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
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-gold">
                    <Pin size={11} className="fill-gold" />
                  </span>
                )}
                <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  <Heart size={10} className="fill-white" /> {r.likes_count}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      )}

      {media && media.length > 0 && (
        <section className="px-1">
          <h2 className="mb-3 text-sm font-bold text-neutral-300">{t.cast.photos}</h2>
          <CastPhotoGrid photos={media} castName={cast.name} />
        </section>
      )}

      {schedules && schedules.length > 0 && (
      <section className="px-1">
        <h2 className="mb-3 text-sm font-bold text-neutral-300">{t.cast.schedule}</h2>
          <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-neutral-900">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{s.date}</span>
                <span className="text-neutral-400">
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
        <h2 className="mb-3 text-sm font-bold text-neutral-300">{t.cast.diary}</h2>
          <ul className="space-y-4">
            {diaryEntries.map((d) => (
              <li key={d.id} className="rounded-lg border border-white/10 bg-neutral-900 p-4">
                <p className="font-semibold">{d.title || t.cast.untitled}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                  {d.body}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
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
