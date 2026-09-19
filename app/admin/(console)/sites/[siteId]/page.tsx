import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { LocapassShopStatusToggle } from "@/components/admin/LocapassShopStatusToggle";

export default async function AdminSiteDashboardPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId: siteIdRaw } = await params;
  const siteId = Number(siteIdRaw);
  const scope = await requireAdmin();
  if (!Number.isFinite(siteId)) notFound();
  if (scope.portalIds !== null && !scope.portalIds.includes(siteId)) notFound();

  const supabase = await createClient();

  const [{ data: site }, { data: reelStatRows }] = await Promise.all([
    supabase.from("locapass_portals").select("id, name, slug, home_url, cover_image_url, tagline").eq("id", siteId).maybeSingle(),
    supabase.from("locapass_reels").select("id, status").eq("portal_id", siteId),
  ]);

  if (!site) notFound();

  const { data: shops, error } = await supabase
    .from("locapass_shops")
    .select("id, name, category, status, created_at")
    .eq("portal_id", siteId)
    .order("created_at", { ascending: false });

  const totalCount = shops?.length ?? 0;
  const activeCount = shops?.filter((s) => s.status === "active").length ?? 0;
  const publishedReelCount = (reelStatRows ?? []).filter((r) => r.status === "publish").length;

  return (
    <div className="space-y-6">
      <Link href="/admin/sites" className="text-sm text-slate-500 hover:text-slate-900">
        ← サイト一覧に戻る
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{site.name || `(無題) #${site.id}`}</h1>
        {site.tagline && <p className="mt-1 text-sm text-slate-500">{site.tagline}</p>}
        <p className="mt-1 text-xs text-slate-400">
          slug: {site.slug || "-"} / {site.home_url ?? "-"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="全店舗" value={totalCount} />
        <StatCard label="公開中" value={activeCount} accent="text-emerald-600" />
        <StatCard label="公開リール数" value={publishedReelCount} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-6 text-sm font-bold text-slate-900">このサイトの店舗一覧</h2>
        {error && <p className="p-4 text-sm text-red-600">店舗の取得に失敗しました: {error.message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">店舗名</th>
                <th className="px-5 py-3 font-medium">ジャンル</th>
                <th className="px-5 py-3 font-medium">状態</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(shops ?? []).map((shop) => (
                <tr key={shop.id} className="text-slate-700 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/locapass-shops/${shop.id}`}
                      className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                    >
                      {shop.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{shop.category || "-"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        shop.status === "active"
                          ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                          : "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700"
                      }
                    >
                      {shop.status === "active" ? "公開中" : "非公開"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <LocapassShopStatusToggle shopId={shop.id} status={shop.status} />
                  </td>
                </tr>
              ))}
              {(shops ?? []).length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">
                    このサイトに店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
