import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { CreatePortalForm } from "@/components/admin/portal/CreatePortalForm";

/**
 * ポータル一覧。super_admin は全ポータル+新規発行、portal_admin は担当ポータルのみ。
 */
export default async function AdminPortalsPage() {
  const scope = await requireAdmin();
  const supabase = await createClient();
  const isSuper = scope.portalIds === null;

  let query = supabase
    .from("locapass_portals")
    .select("id, name, slug, home_url, status, created_at")
    .order("id", { ascending: true });
  if (!isSuper) query = query.in("id", scope.portalIds ?? []);
  const { data: portals, error } = await query;

  const portalIds = (portals ?? []).map((p) => p.id);
  const [{ data: shopRows }, { data: adminRows }] = await Promise.all([
    portalIds.length
      ? supabase.from("locapass_shops").select("portal_id, status").in("portal_id", portalIds)
      : Promise.resolve({ data: [] as { portal_id: number; status: string }[] }),
    portalIds.length
      ? supabase.from("locapass_portal_admins").select("portal_id").in("portal_id", portalIds)
      : Promise.resolve({ data: [] as { portal_id: number }[] }),
  ]);

  const shopCounts = new Map<number, { total: number; active: number }>();
  for (const row of shopRows ?? []) {
    const c = shopCounts.get(row.portal_id) ?? { total: 0, active: 0 };
    c.total += 1;
    if (row.status === "active") c.active += 1;
    shopCounts.set(row.portal_id, c);
  }
  const adminCounts = new Map<number, number>();
  for (const row of adminRows ?? []) adminCounts.set(row.portal_id, (adminCounts.get(row.portal_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">ポータル管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSuper
            ? "全ポータルの一覧です。新規ポータルの発行と、各ポータルの管理者(portal_admin)の招待ができます。"
            : "担当ポータルの一覧です。ポータルを開くと、配下の店舗の発行・管理ができます。"}
        </p>
      </div>

      {isSuper && <CreatePortalForm />}

      {error && <p className="text-sm text-red-600">ポータルの取得に失敗しました: {error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(portals ?? []).map((portal) => {
          const counts = shopCounts.get(portal.id) ?? { total: 0, active: 0 };
          return (
            <Link
              key={portal.id}
              href={`/admin/portals/${portal.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">{portal.name || `(無題) #${portal.id}`}</h2>
                {portal.status !== "active" && (
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    停止中
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {portal.slug || "-"}
                {portal.home_url ? ` / ${portal.home_url}` : ""}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                店舗 {counts.total}件(公開中 {counts.active}件)
              </p>
              <p className="mt-1 text-xs text-slate-500">ポータル管理者 {adminCounts.get(portal.id) ?? 0}名</p>
            </Link>
          );
        })}
        {(portals ?? []).length === 0 && !error && (
          <p className="text-sm text-slate-400">表示できるポータルがありません</p>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-6 text-sm font-bold text-slate-900">発行済み子ポータル一覧</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">ポータル名</th>
                <th className="px-5 py-3 font-medium">スラッグ</th>
                <th className="px-5 py-3 font-medium">作成日</th>
                <th className="px-5 py-3 font-medium">ステータス</th>
                <th className="px-5 py-3 font-medium">管理画面</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(portals ?? []).map((portal) => (
                <tr key={portal.id} className="text-slate-700">
                  <td className="px-5 py-3 font-semibold text-slate-900">{portal.name || `(無題) #${portal.id}`}</td>
                  <td className="px-5 py-3 font-mono text-xs">{portal.slug || "-"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {new Date(portal.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${portal.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {portal.status === "active" ? "有効" : portal.status || "不明"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/portals/${portal.id}`} className="font-semibold text-indigo-600 hover:underline">
                      開く →
                    </Link>
                  </td>
                </tr>
              ))}
              {(portals ?? []).length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">発行済みポータルはありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
