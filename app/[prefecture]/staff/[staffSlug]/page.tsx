import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InquiryButton } from "@/components/InquiryButton";
import { JsonLd } from "@/components/JsonLd";
import { StreamThumb } from "@/components/video/StreamThumb";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { shopPath, staffPath, staffReelsPath, parseStaffSlug } from "@/lib/locapass/publicUrls";

// 他の公開ページ(店舗・パートナー)と同じ60秒キャッシュ。
export const revalidate = 60;

type PageParams = { prefecture: string; staffSlug: string };

async function resolveStaff(params: PageParams) {
  const supabase = await createClient();
  const parsed = parseStaffSlug(params.staffSlug);
  if (!parsed) return { supabase, portal: null, staff: null, staffError: null };

  const { data: portal } = await supabase
    .from("locapass_portals")
    .select("id, slug")
    .eq("slug", params.prefecture)
    .maybeSingle();

  if (!portal) return { supabase, portal: null, staff: null, staffError: null };

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, slug")
    .eq("portal_id", portal.id)
    .eq("slug", parsed.shopSlug)
    .maybeSingle();

  if (!shop) return { supabase, portal, staff: null, staffError: null };

  const { data: staff, error: staffError } = await supabase
    .from("locapass_shop_staff_members")
    .select(
      "id, name, bio, avatar_url, shop_id, issue_no, created_at, shops:locapass_shops ( id, slug, name, area:category )",
    )
    .eq("shop_id", shop.id)
    .eq("issue_no", parsed.issueNo)
    .maybeSingle();

  return { supabase, portal, staff, staffError };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const { portal, staff } = await resolveStaff(resolvedParams);

  if (!portal || !staff) {
    return { title: "スタッフが見つかりません | LOCAPASS" };
  }
  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  const title = `${staff.name}｜${shop?.name ?? "LOCAPASS"}のスタッフ`;
  const description = staff.bio?.slice(0, 120) || `${shop?.name ?? ""}のスタッフ「${staff.name}」のプロフィール・投稿リール。`;
  const url = `https://locapass.net${staffPath(portal.slug, shop!.slug, staff.issue_no)}`;
  const image = sanitizeImageUrl(staff.avatar_url);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "LOCAPASS", images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const resolvedParams = await params;
  const { supabase, portal, staff, staffError } = await resolveStaff(resolvedParams);

  if (staffError && staffError.code !== "PGRST116") {
    throw new Error(`locapass_shop_staff_members取得に失敗しました: ${staffError.message}`);
  }

  if (!portal || !staff) {
    notFound();
  }

  const { data: reels } = await supabase
    .from("locapass_reels")
    .select(`id, ${LOCAPASS_REEL_MEDIA_SELECT}, like_count`)
    .eq("posted_by_staff_id", staff.id)
    .eq("status", "publish")
    .eq("reel_type", "permanent")
    .order("published_at", { ascending: false });

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;
  const reelItems = (reels ?? []).map((r) => ({ ...r, media: toReelMedia(r) }));
  const postCount = reelItems.length;
  const totalLikes = reelItems.reduce((sum, r) => sum + r.like_count, 0);

  const shopUrl = shop ? `https://locapass.net${shopPath(portal.slug, shop.slug)}` : null;
  const staffUrl = `https://locapass.net${staffPath(portal.slug, shop!.slug, staff.issue_no)}`;

  return (
    <div className="space-y-8 pb-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          dateCreated: staff.created_at,
          mainEntity: {
            "@type": "Person",
            "@id": `${staffUrl}#person`,
            identifier: staff.id,
            name: staff.name,
            image: sanitizeImageUrl(staff.avatar_url),
            description: staff.bio?.slice(0, 200) || `${shop?.name ?? "LOCAPASS"}のスタッフ「${staff.name}」のプロフィール`,
            jobTitle: "スタッフ",
            url: staffUrl,
            worksFor:
              shop && shopUrl
                ? {
                    "@type": "Organization",
                    name: shop.name,
                    url: shopUrl,
                  }
                : undefined,
          },
        }}
      />

      {shop && shopUrl && (
        <Link href={shopPath(portal.slug, shop.slug)} className="text-sm text-brand hover:underline">
          ← {shop.name} の一覧に戻る
        </Link>
      )}

      {/* プロフィールヘッダー(パートナー公開ページと同じ構成、閲覧専用) */}
      <section className="px-1">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {staff.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sanitizeImageUrl(staff.avatar_url)}
                alt=""
                className="h-20 w-20 rounded-full border border-main/10 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-main/10 bg-tone-800 text-2xl font-semibold text-tone-500">
                {staff.name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{staff.name}</h1>
            {shop && (
              <p className="truncate text-xs text-muted">
                {shop.name} スタッフ ・ {shop.area}
              </p>
            )}

            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-base font-bold">{postCount}</p>
                <p className="text-[11px] text-muted">投稿</p>
              </div>
              <div>
                <p className="text-base font-bold">{totalLikes}</p>
                <p className="text-[11px] text-muted">いいね</p>
              </div>
            </div>
          </div>
        </div>

        {staff.bio && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-tone-300">{staff.bio}</p>
        )}

        {/* DM: 一般ユーザーがログイン不要でこのスタッフの店舗宛にメッセージを送れる(店舗のお問い合わせと同じ仕組み)。 */}
        {shop && <InquiryButton shopId={shop.id} shopName={`${shop.name}(${staff.name})`} />}

        {shop && shopUrl && (
          <Link
            href={shopPath(portal.slug, shop.slug)}
            className="mt-3 block w-full rounded-lg bg-brand px-6 py-2 text-center text-sm font-semibold text-main hover:bg-brand-dark"
          >
            店舗ページを見る
          </Link>
        )}
      </section>

      {/* 投稿グリッド(リール) */}
      {reelItems.length > 0 && (
        <section>
          <div className="grid grid-cols-3 gap-1 border-t border-main/10 pt-1">
            {reelItems.map((r) => {
              const item = (r.media as { type: "video" | "image"; url: string }[])[0];
              return (
                <Link
                  key={r.id}
                  href={`${staffReelsPath(portal.slug, shop!.slug, staff.issue_no)}?start=${r.id}`}
                  className="relative block aspect-[9/16] overflow-hidden bg-surface"
                >
                  {item?.type === "video" ? (
                    <StreamThumb url={item.url} className="h-full w-full object-cover" />
                  ) : item ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                  <span data-surface="media" className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-main">
                    <Heart size={10} className="fill-main" /> {r.like_count}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
