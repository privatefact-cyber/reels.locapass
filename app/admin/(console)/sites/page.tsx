import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

export default async function AdminSitesPage() {
  const scope = await requireAdmin();
  const supabase = await createClient();

  let query = supabase.from("locapass_sites").select("id, name, slug, home_url").order("id", { ascending: true });
  if (scope.siteIds !== null) {
    query = query.in("id", scope.siteIds);
  }
  const { data: sites, error } = await query;

  const siteIds = (sites ?? []).map((s) => s.id);
  const { data: shopRows } = siteIds.length
    ? await supabase.from("locapass_shops").select("site_id, status").in("site_id", siteIds)
    : { data: [] as { site_id: number; status: string }[] };

  const countsBySite = new Map<number, { total: number; active: number }>();
  for (const row of shopRows ?? []) {
    const c = countsBySite.get(row.site_id) ?? { total: 0, active: 0 };
    c.total += 1;
    if (row.status === "active") c.active += 1;
    countsBySite.set(row.site_id, c);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">サイト管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope.siteIds === null
            ? "全ポータル(サイト)の一覧です。クリックするとサイトごとのダッシュボードに入れます。"
            : "担当ポータル(サイト)の一覧です。"}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">サイトの取得に失敗しました: {error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(sites ?? []).map((site) => {
          const counts = countsBySite.get(site.id) ?? { total: 0, active: 0 };
          return (
            <Link
              key={site.id}
              href={`/admin/sites/${site.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <h2 className="text-sm font-bold text-slate-900">{site.name || `(無題) #${site.id}`}</h2>
              <p className="mt-1 text-xs text-slate-400">{site.home_url ?? "-"}</p>
              <p className="mt-3 text-sm text-slate-600">
                店舗 {counts.total}件（公開中 {counts.active}件）
              </p>
            </Link>
          );
        })}
        {(sites ?? []).length === 0 && !error && (
          <p className="text-sm text-slate-400">表示できるサイトがありません</p>
        )}
      </div>
    </div>
  );
}
