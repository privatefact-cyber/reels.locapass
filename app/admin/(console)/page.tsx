import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CreatePortalForm } from "@/components/admin/portal/CreatePortalForm";
import { CreatePortalShopForm } from "@/components/admin/portal/CreatePortalShopForm";
import { EditPortalNameForm } from "@/components/admin/portal/EditPortalNameForm";
import { LocapassShopStatusToggle } from "@/components/admin/LocapassShopStatusToggle";
import { MachiNoKoeBetaToggle } from "@/components/admin/MachiNoKoeBetaToggle";
import { ConciergeBetaMetrics } from "@/components/admin/ConciergeBetaMetrics";

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

  let portalsQuery = supabase
    .from("locapass_portals")
    .select("id, name, slug, home_url, status, created_at")
    .order("id", { ascending: true });
  if (scope.portalIds !== null) portalsQuery = portalsQuery.in("id", scope.portalIds);

  const portalIds = scope.portalIds;
  const [{ data: shops, error }, { data: allShops }, { data: portals }, { data: portalShopRows }, { data: portalAdminRows }, { data: settings }] = await Promise.all([
    query,
    countsQuery,
    portalsQuery,
    portalIds === null
      ? supabase.from("locapass_shops").select("portal_id, status")
      : portalIds.length
        ? supabase.from("locapass_shops").select("portal_id, status").in("portal_id", portalIds)
        : Promise.resolve({ data: [] as { portal_id: number; status: string }[] }),
    portalIds === null
      ? supabase.from("locapass_portal_admins").select("portal_id")
      : portalIds.length
        ? supabase.from("locapass_portal_admins").select("portal_id").in("portal_id", portalIds)
        : Promise.resolve({ data: [] as { portal_id: number }[] }),
    supabase.from("platform_settings").select("locapass_machi_no_koe_beta_enabled").eq("id", true).maybeSingle(),
  ]);
  const machiNoKoeEnabled = settings?.locapass_machi_no_koe_beta_enabled ?? false;

  const totalCount = allShops?.length ?? 0;
  const activeCount = allShops?.filter((s) => s.status === "active").length ?? 0;
  const inactiveCount = totalCount - activeCount;
  const portalShopCounts = new Map<number, { total: number; active: number }>();
  for (const row of portalShopRows ?? []) {
    const count = portalShopCounts.get(row.portal_id) ?? { total: 0, active: 0 };
    count.total += 1;
    if (row.status === "active") count.active += 1;
    portalShopCounts.set(row.portal_id, count);
  }
  const portalAdminCounts = new Map<number, number>();
  for (const row of portalAdminRows ?? []) {
    portalAdminCounts.set(row.portal_id, (portalAdminCounts.get(row.portal_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">店舗一覧</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope.portalIds === null
            ? "ポータルの発行・管理と、全ポータルの店舗管理を行います。"
            : "担当ポータルの店舗のみ表示しています。新規店舗の発行、公開/非公開の切り替えを行います。"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="全店舗" value={totalCount} />
        <StatCard label="公開中" value={activeCount} accent="text-emerald-600" />
        <StatCard label="非公開" value={inactiveCount} accent="text-red-600" />
      </div>

      {scope.portalIds === null && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">AI「街の声」ベータ版</h2>
              <span
                className={
                  machiNoKoeEnabled
                    ? "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
                    : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
                }
              >
                {machiNoKoeEnabled ? "表示中" : "非表示"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              コンシェルジュのチャットに「街の声 β」タブを出し、自動収集した街の噂(npm run sync-whispers)を織り込んで店舗を提案する。
              LUXELAとは別に切り替わる。非表示にしても収集した噂は消えない。
            </p>
          </div>
          <MachiNoKoeBetaToggle enabled={machiNoKoeEnabled} />
          <div className="w-full">
            <ConciergeBetaMetrics />
          </div>
        </div>
      )}

      {scope.portalIds === null && <CreatePortalForm />}

      <section id="portals" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900">ポータル管理</h2>
          <p className="mt-1 text-sm text-slate-500">発行済みポータルの確認、名称変更、各ポータルの詳細管理を行えます。</p>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {(portals ?? []).map((portal) => {
            const counts = portalShopCounts.get(portal.id) ?? { total: 0, active: 0 };
            return (
              <div key={portal.id} className="rounded-xl border border-slate-200 p-4">
                <Link href={`/admin/portals/${portal.id}`} className="block hover:text-indigo-600">
                  <h3 className="text-sm font-bold text-slate-900">{portal.name || `(無題) #${portal.id}`}</h3>
                  <p className="mt-1 text-xs text-slate-400">{portal.slug || "-"}{portal.home_url ? ` / ${portal.home_url}` : ""}</p>
                  <p className="mt-3 text-sm text-slate-600">店舗 {counts.total}件（公開中 {counts.active}件）</p>
                  <p className="mt-1 text-xs text-slate-500">ポータル管理者 {portalAdminCounts.get(portal.id) ?? 0}名</p>
                </Link>
                {scope.portalIds === null && <EditPortalNameForm portalId={portal.id} currentName={portal.name ?? ""} />}
              </div>
            );
          })}
          {(portals ?? []).length === 0 && <p className="text-sm text-slate-400">表示できるポータルがありません</p>}
        </div>
      </section>

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
