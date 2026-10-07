import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { JsonLd } from "@/components/JsonLd";
import {
  StaffDashboardClient,
  type MyReel,
  type ShopEventRow,
  type InquiryRow,
  type DmThreadRow,
} from "@/components/locapass-mypage/StaffDashboardClient";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { staffPath, parseStaffSlug } from "@/lib/locapass/publicUrls";

// 他の公開ページ(店舗・パートナー)と同じ60秒キャッシュ。本人が見ている場合はcookie読み取りが
// 発生するため実際には毎回動的レンダリングされる。
export const revalidate = 60;

type PageParams = { prefecture: string; staffSlug: string };

/**
 * スタッフの公開プロフィールページ。Instagramの自分のプロフィールと同じ思想で、
 * ログイン中の本人が見ている場合だけ投稿・イベント投稿・DM対応などの管理UIが出る
 * (旧/dashboard/staffはこのページへのリダイレクトのみになった)。
 */
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
      "id, name, bio, avatar_url, shop_id, issue_no, created_at, shops:locapass_shops ( id, slug, name, area:category, portal_id )",
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

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  // ログイン中の本人がこのスタッフ自身かどうか(Instagramの「自分のプロフィール」判定と同じ)。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isOwner = false;
  if (user) {
    const { data: viewerStaffId } = await supabase.rpc("locapass_current_staff_member_id");
    isOwner = viewerStaffId === staff.id;
  }

  const { data: reels } = await supabase
    .from("locapass_reels")
    .select(`id, caption, ${LOCAPASS_REEL_MEDIA_SELECT}, like_count, published_at, updated_at, tags`)
    .eq("posted_by_staff_id", staff.id)
    .eq("status", "publish")
    .eq("reel_type", "permanent")
    .order("published_at", { ascending: false });

  const myReels: MyReel[] = (reels ?? []).map((r) => ({
    id: r.id,
    caption: r.caption,
    media: toReelMedia(r),
    likesCount: r.like_count,
    createdAt: r.published_at ?? r.updated_at,
    tags: r.tags ?? [],
  }));

  let shopEvents: ShopEventRow[] = [];
  let inquiryRows: InquiryRow[] = [];
  let dmThreadRows: DmThreadRow[] = [];
  let qrDataUrl: string | null = null;

  if (isOwner) {
    const [{ data: events }, { data: inquiries }, { data: dmThreads }] = await Promise.all([
      supabase
        .from("locapass_shop_events")
        .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_by_staff_id, created_at")
        .eq("shop_id", staff.shop_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("locapass_shop_inquiries")
        .select("id, customer_name, contact, status, updated_at")
        .eq("shop_id", staff.shop_id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("locapass_staff_dm_threads")
        .select("id, user_nickname, last_message_at")
        .eq("staff_id", staff.id)
        .order("last_message_at", { ascending: false }),
    ]);

    dmThreadRows = (dmThreads ?? []).map((t) => ({
      id: t.id,
      userNickname: t.user_nickname,
      lastMessageAt: t.last_message_at,
    }));

    shopEvents = (events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      body: e.body,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      imageUrl: e.image_url,
      galleryImageUrls: e.gallery_image_urls ?? [],
      isOwn: e.created_by_staff_id === staff.id,
      isEnded: !!e.ends_at && new Date(e.ends_at).getTime() < Date.now(),
    }));

    inquiryRows = (inquiries ?? []).map((i) => ({
      id: i.id,
      customerName: i.customer_name,
      contact: i.contact,
      status: i.status,
      updatedAt: i.updated_at,
    }));

    if (shop?.slug) {
      const staffUrl = `https://locapass.net${staffPath(portal.slug, shop.slug, staff.issue_no)}`;
      qrDataUrl = await QRCode.toDataURL(staffUrl, { margin: 1, width: 220 });
    }
  }

  const staffUrl = `https://locapass.net${staffPath(portal.slug, shop!.slug, staff.issue_no)}`;

  return (
    <>
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
            worksFor: shop
              ? {
                  "@type": "Organization",
                  name: shop.name,
                  url: `https://locapass.net/${portal.slug}/shops/${shop.slug}`,
                }
              : undefined,
          },
        }}
      />
      <StaffDashboardClient
        isOwner={isOwner}
        userId={user?.id ?? ""}
        portalId={shop?.portal_id ?? 0}
        portalSlug={portal.slug}
        staffId={staff.id}
        shopId={staff.shop_id}
        shopSlug={shop?.slug ?? null}
        issueNo={staff.issue_no}
        shopName={shop?.name ?? null}
        qrDataUrl={qrDataUrl}
        initialName={staff.name}
        initialBio={staff.bio}
        initialAvatarUrl={staff.avatar_url}
        initialReels={myReels}
        initialEvents={shopEvents}
        initialInquiries={inquiryRows}
        initialDmThreads={dmThreadRows}
      />
    </>
  );
}
