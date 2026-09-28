import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import type { ReelItem } from "@/lib/reels/types";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";
import { staffPath, parseStaffSlug } from "@/lib/locapass/publicUrls";

export const revalidate = 60;

export default async function StaffReelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ prefecture: string; staffSlug: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { prefecture, staffSlug } = await params;
  const { start } = await searchParams;
  const supabase = await createClient();

  const parsed = parseStaffSlug(staffSlug);
  if (!parsed) {
    notFound();
  }

  const { data: portal } = await supabase
    .from("locapass_portals")
    .select("id, slug")
    .eq("slug", prefecture)
    .maybeSingle();

  if (!portal) {
    notFound();
  }

  const { data: shopRow } = await supabase
    .from("locapass_shops")
    .select("id, slug")
    .eq("portal_id", portal.id)
    .eq("slug", parsed.shopSlug)
    .maybeSingle();

  if (!shopRow) {
    notFound();
  }

  const { data: staff, error: staffError } = await supabase
    .from("locapass_shop_staff_members")
    .select("id, name, avatar_url, shop_id, issue_no, shops:locapass_shops ( id, slug, name, address, category )")
    .eq("shop_id", shopRow.id)
    .eq("issue_no", parsed.issueNo)
    .maybeSingle();

  if (staffError && staffError.code !== "PGRST116") {
    throw new Error(`locapass_shop_staff_members取得に失敗しました: ${staffError.message}`);
  }

  if (!staff) {
    notFound();
  }

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  const { data: reelRows } = await supabase
    .from("locapass_reels")
    .select(`id, caption, ${LOCAPASS_REEL_MEDIA_SELECT}, like_count, shop_id, action_url, published_at, updated_at, is_comments_enabled`)
    .eq("posted_by_staff_id", staff.id)
    .eq("status", "publish")
    .eq("reel_type", "permanent")
    .order("published_at", { ascending: false });

  const reels: ReelItem[] = (reelRows ?? []).map((row) => ({
    id: row.id,
    caption: row.caption,
    media: toReelMedia(row),
    likesCount: row.like_count,
    castId: null,
    castName: staff.name,
    castAvatarUrl: staff.avatar_url,
    shopId: row.shop_id ?? staff.shop_id,
    shopName: shop?.name ?? "",
    shopSlug: parsed.shopSlug,
    portalSlug: portal.slug,
    castIssueNo: null,
    staffId: staff.id,
    staffIssueNo: staff.issue_no,
    area: null,
    address: shop?.address ?? null,
    genre: shop?.category ?? null,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
    isCommentsEnabled: row.is_comments_enabled,
  }));

  // プロフィールのグリッドから特定の投稿をタップして来た場合、その投稿から再生を始める。
  const startIndex = start ? reels.findIndex((r) => r.id === start) : -1;
  const orderedReels =
    startIndex > 0 ? [...reels.slice(startIndex), ...reels.slice(0, startIndex)] : reels;

  return (
    <div className="space-y-3">
      <Link
        href={staffPath(portal.slug, parsed.shopSlug, staff.issue_no)}
        className="inline-block px-1 text-sm text-brand hover:underline"
      >
        ← {staff.name} のプロフィールに戻る
      </Link>
      <ReelLoopFeed reels={orderedReels} />
    </div>
  );
}
