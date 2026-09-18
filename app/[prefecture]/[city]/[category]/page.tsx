import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { JsonLd } from "@/components/JsonLd";
import { PREFECTURE_SLUG, PREFECTURE_LABEL, areaToSlug, slugToArea } from "@/lib/seo/area";
import { genreToSlug, slugToGenre } from "@/lib/shop/genres";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";

// この動的ルートは generateStaticParams を持たない(=ビルド時の事前レンダリング対象に
// 含めない)。店舗詳細・キャスト詳細ページと同じく、初回アクセス時にオンデマンドで
// 生成してrevalidate=60でキャッシュする方式。generateStaticParamsを付けると、
// このファイルが使う認証Cookie依存のSupabaseサーバークライアント(lib/supabase/server)が
// ビルド時(リクエスト外)には呼べずビルドが失敗するため。
export const revalidate = 60;

type PageParams = { prefecture: string; city: string; category: string };

function resolveParams(params: PageParams) {
  if (params.prefecture !== PREFECTURE_SLUG) return null;
  const area = slugToArea(params.city);
  const genre = slugToGenre(params.category);
  if (!area || !genre) return null;
  return { area, genre };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const resolved = resolveParams(await params);
  if (!resolved) return { title: "ページが見つかりません | LOCAPASS" };
  const { area, genre } = resolved;

  const title = `${area}の${genre}｜本日の出勤・キャスト一覧 - LOCAPASS`;
  const description = `${area}エリアの${genre}求人・出勤情報をリールでチェック。${area} ${genre} 出勤中のキャストを今すぐ探せる。`;
  const url = `https://luxela.jp/${PREFECTURE_SLUG}/${areaToSlug(area)}/${genreToSlug(genre)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "LOCAPASS" },
    twitter: { card: "summary", title, description },
  };
}

export default async function AreaCategoryPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = await params;
  const resolved = resolveParams(resolvedParams);
  if (!resolved) notFound();
  const { area, genre } = resolved;

  const supabase = await createClient();
  const { data: shopRows } = await supabase
    .from("shops")
    .select("id, name, tagline, cover_image_url")
    .eq("status", "active")
    .eq("area", area)
    .eq("genre", genre)
    .order("created_at", { ascending: false });

  const shops = shopRows ?? [];
  if (shops.length === 0) notFound();

  const shopIds = shops.map((s) => s.id);
  const { data: castRows } = await supabase.from("cast_members").select("id, shop_id").in("shop_id", shopIds);
  const shopIdByCastId = new Map((castRows ?? []).map((c) => [c.id, c.shop_id]));
  const castIds = (castRows ?? []).map((c) => c.id);

  const { data: todaySchedules } = castIds.length
    ? await supabase
        .from("schedules")
        .select("cast_id")
        .in("cast_id", castIds)
        .eq("date", toJstDateString(getJstNow()))
        .eq("is_working_today", true)
    : { data: [] as { cast_id: string }[] };

  const workingCountByShopId = new Map<string, number>();
  for (const s of todaySchedules ?? []) {
    const targetShopId = shopIdByCastId.get(s.cast_id);
    if (!targetShopId) continue;
    workingCountByShopId.set(targetShopId, (workingCountByShopId.get(targetShopId) ?? 0) + 1);
  }

  const pageUrl = `https://luxela.jp/${PREFECTURE_SLUG}/${areaToSlug(area)}/${genreToSlug(genre)}`;

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-4xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ホーム", item: "https://luxela.jp" },
            { "@type": "ListItem", position: 2, name: `${area}の${genre}`, item: pageUrl },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: shops.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://luxela.jp/shops/${s.id}`,
            name: s.name,
          })),
        }}
      />

      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-amber-400/70">
          {PREFECTURE_LABEL} / {area}
        </p>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
          {area}
          {genre}
        </h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          {area}エリアの{genre}
          {shops.length}店舗を掲載中。本日出勤中のキャストや店舗の雰囲気をリールで確認して、気になるお店をチェックしてください。
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-amber-200">掲載店舗一覧</h2>
          <Link
            href={`/${PREFECTURE_SLUG}/${resolvedParams.city}/map`}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
          >
            🗺️ マップで見る
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shops.map((shop) => {
            const workingCount = workingCountByShopId.get(shop.id) ?? 0;
            return (
              <Link
                key={shop.id}
                href={`/shops/${shop.id}`}
                className="group flex gap-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-zinc-900/60 p-3 shadow-lg transition hover:border-amber-400/50"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
                  {shop.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shop.cover_image_url}
                      alt={shop.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{shop.name}</p>
                  {shop.tagline && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{shop.tagline}</p>
                  )}
                  {workingCount > 0 && (
                    <span className="mt-2 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      本日出勤 {workingCount}名
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-amber-200">
          {area}で{genre}を探す方へ
        </h2>
        <p className="text-sm leading-relaxed text-neutral-400">
          LOCAPASSでは{area}エリアの{genre}
          の出勤情報・キャストのリールをまとめてチェックできます。他のエリア・業態から探したい場合は
          <Link href="/" className="text-amber-300 underline underline-offset-2">
            トップページ
          </Link>
          からも検索できます。
        </p>
      </section>
    </div>
  );
}
