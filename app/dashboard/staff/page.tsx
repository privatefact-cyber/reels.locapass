import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentStaff } from "@/lib/staff/current-staff";
import {
  StaffDashboardClient,
  type MyReel,
  type ShopEventRow,
  type InquiryRow,
} from "@/components/locapass-mypage/StaffDashboardClient";

/**
 * staff 本人の画面。LUXELA本家のスタッフマイページ(app/staff/mypage)と同じUI。
 * 本人の所属店舗(locapass_shop_staff_members.shop_id)の情報だけを扱い、スタッフでなければ振り分けに戻す。
 */
export default async function StaffDashboardPage() {
  const staff = await requireCurrentStaff();
  if (!staff) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: reels }, { data: events }, { data: inquiries }] = await Promise.all([
    supabase
      .from("locapass_reels")
      .select("id, caption, video_url, images, poster_url, like_count, published_at, updated_at")
      .eq("posted_by_staff_id", staff.id)
      .order("published_at", { ascending: false, nullsFirst: false }),
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
  ]);

  const myReels: MyReel[] = (reels ?? []).map((r) => {
    const images = (r.images as { url: string }[] | null) ?? [];
    const media: MyReel["media"] = r.video_url
      ? [{ type: "video", url: r.video_url }]
      : images.length > 0
        ? images.map((img) => ({ type: "image" as const, url: img.url }))
        : r.poster_url
          ? [{ type: "image", url: r.poster_url }]
          : [];
    return {
      id: r.id,
      caption: r.caption,
      media,
      likesCount: r.like_count,
      createdAt: r.published_at ?? r.updated_at,
    };
  });

  const shopEvents: ShopEventRow[] = (events ?? []).map((e) => ({
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

  const inquiryRows: InquiryRow[] = (inquiries ?? []).map((i) => ({
    id: i.id,
    customerName: i.customer_name,
    contact: i.contact,
    status: i.status,
    updatedAt: i.updated_at,
  }));

  const shop = Array.isArray(staff.locapass_shops) ? staff.locapass_shops[0] : staff.locapass_shops;

  return (
    <StaffDashboardClient
      userId={staff.user_id ?? ""}
      portalId={shop?.portal_id ?? 0}
      staffId={staff.id}
      shopId={staff.shop_id}
      shopName={shop?.name ?? null}
      initialName={staff.name}
      initialBio={staff.bio}
      initialAvatarUrl={staff.avatar_url}
      initialReels={myReels}
      initialEvents={shopEvents}
      initialInquiries={inquiryRows}
    />
  );
}
