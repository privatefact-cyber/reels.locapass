import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { LocapassShopEditForm } from "@/components/admin/LocapassShopEditForm";
import { LocapassShopStatusToggle } from "@/components/admin/LocapassShopStatusToggle";
import { LocapassFloorStatusDropzone } from "@/components/admin/LocapassFloorStatusDropzone";
import { LocapassShopGalleryUploader } from "@/components/admin/LocapassShopGalleryUploader";

export default async function AdminLocapassShopDetailPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const scope = await requireAdmin();
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select(
      "id, name, category, tagline, description, address, tel, business_hours, url, line_url, cover_url, icon_url, status, created_at, site_id, occupancy_status, gallery_image_urls, locapass_sites ( id, name )",
    )
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) notFound();
  // site管理者は自分のsite_id以外の店舗詳細には入れない(RLSでも書込みは別途遮断されるが、
  // 閲覧導線としてもここで弾く)。
  if (scope.siteIds !== null && !scope.siteIds.includes(shop.site_id)) notFound();

  const site = Array.isArray(shop.locapass_sites) ? shop.locapass_sites[0] : shop.locapass_sites;
  const { count: reelCount } = await supabase
    .from("locapass_reels")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);

  const occupancyStatus = shop.occupancy_status as {
    status: "available" | "few_seats" | "full";
    captured_at: string;
  } | null;
  const OCCUPANCY_LABEL: Record<string, string> = {
    available: "空席あり",
    few_seats: "残りわずか",
    full: "満席",
  };
  const initialOccupancyText = occupancyStatus
    ? `${OCCUPANCY_LABEL[occupancyStatus.status] ?? occupancyStatus.status}(撮影 ${new Date(
        occupancyStatus.captured_at,
      ).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`
    : null;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        ← 店舗一覧に戻る
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{shop.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {site?.name ?? "サイト未設定"} / {shop.category || "ジャンル未設定"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            作成日: {new Date(shop.created_at).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              shop.status === "active"
                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
            }
          >
            {shop.status === "active" ? "公開中" : "非公開"}
          </span>
          <LocapassShopStatusToggle shopId={shop.id} status={shop.status} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs text-slate-500">リール投稿数</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{reelCount ?? 0}件</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">混雑状況(AIコンシェルジュ連携)</h2>
        <p className="mt-1 text-xs text-slate-500">
          フロア写真をアップロードすると、AIが混雑状況を判定して案内AIの回答に反映します。
        </p>
        <div className="mt-3">
          <LocapassFloorStatusDropzone shopId={shop.id} initialStatusText={initialOccupancyText} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">店舗紹介ギャラリー</h2>
        <p className="mt-1 text-xs text-slate-500">
          店内の雰囲気が伝わる写真を最大10枚まで登録できます。表側の店舗ページに表示されます。
        </p>
        <div className="mt-3">
          <LocapassShopGalleryUploader shopId={shop.id} initialUrls={shop.gallery_image_urls ?? []} />
        </div>
      </div>

      <LocapassShopEditForm
        shop={{
          id: shop.id,
          name: shop.name,
          category: shop.category,
          tagline: shop.tagline,
          description: shop.description,
          address: shop.address,
          tel: shop.tel,
          business_hours: shop.business_hours,
          url: shop.url,
          line_url: shop.line_url,
          cover_url: shop.cover_url,
          icon_url: shop.icon_url,
        }}
      />
    </div>
  );
}
