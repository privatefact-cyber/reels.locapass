import { redirect } from "next/navigation";
import { requireCurrentStaff } from "@/lib/staff/current-staff";
import { createClient } from "@/lib/supabase/server";
import { StaffMypageClient, type MyReel, type ShopEventRow, type InquiryRow } from "@/components/StaffMypageClient";

export default async function StaffMypage() {
  const staff = await requireCurrentStaff();
  if (!staff) {
    redirect("/staff/login");
  }

  const supabase = await createClient();

  const [{ data: reels }, { data: events }, { data: inquiries }] = await Promise.all([
    supabase
      .from("reels")
      .select("id, caption, media, likes_count, created_at")
      .eq("posted_by_staff_id", staff.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_events")
      .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_by_staff_id, created_at")
      .eq("shop_id", staff.shop_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_inquiries")
      .select("id, customer_name, contact, status, updated_at")
      .eq("shop_id", staff.shop_id)
      .order("updated_at", { ascending: false }),
  ]);

  const myReels: MyReel[] = (reels ?? []).map((r) => ({
    id: r.id,
    caption: r.caption,
    media: (r.media as MyReel["media"]) ?? [],
    likesCount: r.likes_count,
    createdAt: r.created_at,
  }));

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

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  return (
    <StaffMypageClient
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
