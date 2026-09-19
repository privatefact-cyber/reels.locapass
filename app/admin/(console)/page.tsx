import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CreatePortalShopForm } from "@/components/admin/portal/CreatePortalShopForm";
import { LocapassShopStatusToggle } from "@/components/admin/LocapassShopStatusToggle";

const PLAN_LABELS: Record<string, string> = {
  free: "無料",
};

export default async function AdminShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const scope = await requireAdmin();
  const supabase = await createClient();

  // portal_admin は担当ポータルの店舗のみ、super_admin(portalIds===null)は全ポータル。
  let query = supabase
    .from("locapass_shops")
    .select("id, name, category, status, plan, portal_id, created_at, locapass_portals ( name )")
    .order("created_at", { ascending: false });
  let countsQuery = supabase.from("locapass_shops").select("status");

  if (scope.portalIds !== null) {
    query = query.in("portal_id", scope.portalIds);
    countsQuery = countsQuery.in("portal_id", scope.portalIds);
  }
  if (status === "active") {
    query = query.eq("status", "active");
  } else if (status === "inactive") {
    // 準備中(draft)と停止中(suspended)をまとめて「非公開」として扱う。
    query = query.neq("status", "active");
  }
  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  let portalsQuery = supabase.from("locapass_portals").select("id, name").order("id", { ascending: true });
  if (scope.portalIds !== null) portalsQuery = portalsQuery.in("id", scope.portalIds);

  const [{ data: shops, error }, { data: allShops }, { data: portals }] = await Promise.all([
    query,
    countsQuery,
    portalsQuery,
  ]);

  const totalCount = allShops?.length ?? 0;
  const activeCount = allShops?.filter((s) => s.status === "active").length ?? 0;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">店舗一覧</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope.portalIds === null
            ? "全ポータルの店舗です。新規店舗の発行、公開/非公開の切り替えを行います。店舗管理者の発行はポータル管理から行えます。"
            : "担当ポータルの店舗のみ表示しています。新規店舗の発行、公開/非公開の切り替えを行います。"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="全店舗" value={totalCount} />
        <StatCard label="公開中" value={activeCount} accent="text-emerald-600" />
        <StatCard label="非公開" value={inactiveCount} accent="text-red-600" />
      </div>

      <CreatePortalShopForm portals={portals ?? []} />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="店舗名で検索"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="">すべての状態</option>
            <option value="active">公開中のみ</option>
            <option value="inactive">非公開のみ</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            絞り込む
          </button>
        </form>

        {error && <p className="p-4 text-sm text-red-600">店舗の取得に失敗しました: {error.message}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">店舗名</th>
                <th className="px-5 py-3 font-medium">ポータル / 業種</th>
                <th className="px-5 py-3 font-medium">契約プラン</th>
                <th className="px-5 py-3 font-medium">状態</th>
                <th className="px-5 py-3 font-medium">管理画面ログイン</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(shops ?? []).map((shop) => {
                const site = Array.isArray(shop.locapass_portals) ? shop.locapass_portals[0] : shop.locapass_portals;
                return (
                  <tr key={shop.id} className="text-slate-700 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/shop/${shop.id}`}
                        className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {shop.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {site?.name ?? "-"} / {shop.category || "-"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        {PLAN_LABELS[shop.plan] ?? shop.plan}
                      </span>
                    </td>
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
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/shop/${shop.id}`}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        この店舗の管理画面に入る
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <LocapassShopStatusToggle shopId={shop.id} status={shop.status} />
                    </td>
                  </tr>
                );
              })}
              {(shops ?? []).length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                    該当する店舗がありません
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
