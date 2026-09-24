import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { LocapassShopStatusToggle } from "@/components/admin/LocapassShopStatusToggle";
import { MapVideoOptionToggle } from "@/components/admin/MapVideoOptionToggle";
import { GrantPortalAdminForm } from "@/components/admin/portal/GrantPortalAdminForm";
import { CreatePortalShopForm } from "@/components/admin/portal/CreatePortalShopForm";
import {
  DeleteShopButton,
  GrantShopAdminForm,
  ResetShopAdminPasswordButton,
  RevokePortalAdminButton,
  RevokeShopAdminButton,
} from "@/components/admin/portal/ShopAdminControls";
import { PortalBrandingForm } from "@/components/admin/portal/PortalBrandingForm";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "公開中", className: "bg-emerald-50 text-emerald-700" },
  draft: { label: "準備中", className: "bg-amber-50 text-amber-700" },
  suspended: { label: "停止中", className: "bg-red-50 text-red-700" },
};

/**
 * ポータル管理画面。
 *   super_admin  : ポータル管理者(portal_admin)の招待・解除
 *   portal_admin : 配下店舗の一覧・発行・削除、店舗管理者(shop_admin)の発行・解除・パスワード再発行
 */
export default async function AdminPortalPage({ params }: { params: Promise<{ portalId: string }> }) {
  const { portalId: raw } = await params;
  const portalId = Number(raw);
  const scope = await requireAdmin();
  if (!Number.isFinite(portalId)) notFound();
  if (scope.portalIds !== null && !scope.portalIds.includes(portalId)) notFound();
  const isSuper = scope.portalIds === null;

  const supabase = await createClient();
  const [{ data: portal }, { data: shops, error: shopsError }, { data: reelRows }, { data: portalAdmins }, { data: shopAdmins }] =
    await Promise.all([
      supabase
        .from("locapass_portals")
        .select("id, name, slug, home_url, tagline, description, status, accent_color, background_color, hero_media_type, hero_media_url, hero_link_url, header_color, header_opacity, outer_background_color, font_color")
        .eq("id", portalId)
        .maybeSingle(),
      supabase
        .from("locapass_shops")
        .select("id, name, category, status, shop_code, created_at, map_video_enabled, sns_whisper, is_temporarily_closed")
        .eq("portal_id", portalId)
        .order("created_at", { ascending: false }),
      supabase.from("locapass_reels").select("id, status").eq("portal_id", portalId),
      supabase.rpc("locapass_list_portal_admins", { p_portal_id: portalId }),
      supabase.rpc("locapass_list_portal_shop_admins", { p_portal_id: portalId }),
    ]);

  if (!portal) notFound();

  const adminsByShop = new Map<string, { shop_admin_id: string; email: string }[]>();
  for (const a of shopAdmins ?? []) {
    const list = adminsByShop.get(a.shop_id) ?? [];
    list.push({ shop_admin_id: a.shop_admin_id, email: a.email });
    adminsByShop.set(a.shop_id, list);
  }

  const totalCount = shops?.length ?? 0;
  const activeCount = shops?.filter((s) => s.status === "active").length ?? 0;
  const publishedReelCount = (reelRows ?? []).filter((r) => r.status === "publish").length;

  return (
    <div className="space-y-6">
      <Link href="/admin/portals" className="text-sm text-slate-500 hover:text-slate-900">
        ← ポータル一覧に戻る
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">{portal.name || `(無題) #${portal.id}`}</h1>
          {portal.status !== "active" && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">停止中</span>
          )}
        </div>
        {portal.tagline && <p className="mt-1 text-sm text-slate-500">{portal.tagline}</p>}
        <p className="mt-1 text-xs text-slate-400">
          スラッグ: {portal.slug || "-"}
          {portal.home_url ? ` / ${portal.home_url}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="全店舗" value={totalCount} />
        <StatCard label="公開中" value={activeCount} accent="text-emerald-600" />
        <StatCard label="公開リール数" value={publishedReelCount} />
      </div>

      <PortalBrandingForm portal={portal} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">ポータル管理者(portal_admin)</h2>
        <p className="mt-1 text-xs text-slate-500">
          このポータル配下の店舗の発行・編集・削除と、店舗管理者の発行ができます。
          {isSuper ? "" : "招待・解除はルート管理者のみ行えます。"}
        </p>
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(portalAdmins ?? []).map((a) => (
            <li key={a.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono text-xs text-slate-700">{a.email}</span>
              <span className="flex items-center gap-4">
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString("ja-JP")}</span>
                {isSuper && <RevokePortalAdminButton portalId={portalId} userId={a.user_id} email={a.email} />}
              </span>
            </li>
          ))}
          {(portalAdmins ?? []).length === 0 && (
            <li className="px-4 py-4 text-center text-sm text-slate-400">まだポータル管理者がいません</li>
          )}
        </ul>
        {isSuper && (
          <div className="mt-4">
            <GrantPortalAdminForm portalId={portalId} />
          </div>
        )}
      </section>

      <CreatePortalShopForm portals={[{ id: portal.id, name: portal.name }]} />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-6 text-sm font-bold text-slate-900">
          このポータルの店舗一覧({totalCount}件)
        </h2>
        {shopsError && <p className="p-4 text-sm text-red-600">店舗の取得に失敗しました: {shopsError.message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">店舗名</th>
                <th className="px-5 py-3 font-medium">状態</th>
                <th className="px-5 py-3 font-medium">動画オプション</th>
                <th className="px-5 py-3 font-medium">店舗管理者(shop_admin)</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(shops ?? []).map((shop) => {
                const status = STATUS_LABEL[shop.status] ?? { label: shop.status, className: "bg-slate-100 text-slate-500" };
                const admins = adminsByShop.get(shop.id) ?? [];
                return (
                  <tr key={shop.id} className="align-top text-slate-700">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/shop/${shop.id}`}
                        className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                      >
                        {shop.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {shop.category || "業種未設定"} / 店舗コード {shop.shop_code}
                      </p>
                      {/* 街の声の自動収集結果(npm run sync-whispers)。噂ネタの中身はマウスを乗せると見える。 */}
                      {(shop.sns_whisper || shop.is_temporarily_closed) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {shop.sns_whisper && (
                            <span
                              title={shop.sns_whisper}
                              className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                            >
                              街の噂あり
                            </span>
                          )}
                          {shop.is_temporarily_closed && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              営業停止・閉店の疑い(自動判定・要確認)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          shop.map_video_enabled
                            ? "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
                            : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
                        }
                      >
                        {shop.map_video_enabled ? "契約中" : "未契約"}
                      </span>
                      <div className="mt-2">
                        <MapVideoOptionToggle portalId={portalId} shopId={shop.id} enabled={shop.map_video_enabled} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {admins.length > 0 ? (
                        <ul className="space-y-2">
                          {admins.map((a) => (
                            <li key={a.shop_admin_id}>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono text-xs text-slate-700">{a.email}</span>
                                <RevokeShopAdminButton portalId={portalId} shopAdminId={a.shop_admin_id} email={a.email} />
                              </div>
                              {a.email.endsWith("@shop.locapass.local") && (
                                <ResetShopAdminPasswordButton portalId={portalId} shopAdminId={a.shop_admin_id} />
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-amber-600">未発行</p>
                      )}
                      <div className="mt-2">
                        <GrantShopAdminForm portalId={portalId} shopId={shop.id} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/dashboard/shop/${shop.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          編集
                        </Link>
                        <LocapassShopStatusToggle shopId={shop.id} status={shop.status} />
                        <DeleteShopButton portalId={portalId} shopId={shop.id} shopName={shop.name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(shops ?? []).length === 0 && !shopsError && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                    このポータルにはまだ店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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
