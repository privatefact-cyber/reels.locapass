import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateShopForm } from "@/components/admin/CreateShopForm";
import { ShopStatusToggle } from "@/components/admin/ShopStatusToggle";
import { FeaturedSectionToggle } from "@/components/admin/FeaturedSectionToggle";

const SHOP_LOGIN_URL = "https://luxela.jp/login";

const PLAN_LABELS: Record<string, string> = {
  trial: "体験プラン",
  standard: "スタンダード",
  premium: "プレミアム",
  enterprise: "エンタープライズ",
};

export default async function AdminShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("shops")
    .select("id, name, area, genre, plan, status, shop_code, created_at")
    .order("created_at", { ascending: false });

  if (status === "active" || status === "inactive") {
    query = query.eq("status", status);
  }
  if (q.trim()) {
    query = query.or(`name.ilike.%${q.trim()}%,area.ilike.%${q.trim()}%`);
  }

  const [{ data: shops, error }, { data: castRows }, { data: allShops }, { data: settings }] = await Promise.all([
    query,
    supabase.from("cast_members").select("shop_id"),
    supabase.from("shops").select("status"),
    supabase.from("platform_settings").select("featured_section_enabled").eq("id", true).maybeSingle(),
  ]);
  const featuredSectionEnabled = settings?.featured_section_enabled ?? false;

  const castCountByShop = new Map<string, number>();
  for (const row of castRows ?? []) {
    castCountByShop.set(row.shop_id, (castCountByShop.get(row.shop_id) ?? 0) + 1);
  }

  const totalCount = allShops?.length ?? 0;
  const activeCount = allShops?.filter((s) => s.status === "active").length ?? 0;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">店舗一覧</h1>
        <p className="mt-1 text-sm text-slate-500">
          新規店舗の発行、公開/非公開の切り替え、ログインアカウントの管理を行います。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="全店舗" value={totalCount} />
        <StatCard label="公開中" value={activeCount} accent="text-emerald-600" />
        <StatCard label="非公開" value={inactiveCount} accent="text-red-600" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">トップページのFEATURED枠</h2>
            <span
              className={
                featuredSectionEnabled
                  ? "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
                  : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
              }
            >
              {featuredSectionEnabled ? "表示中" : "非表示"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            提携店舗のヒーロー・特集カードの表示可否だけを切り替える。featured_rankや取り込んだ紹介文・料金は消えない。
          </p>
        </div>
        <FeaturedSectionToggle enabled={featuredSectionEnabled} />
      </div>

      <CreateShopForm />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="店舗名・エリアで検索"
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
                <th className="px-5 py-3 font-medium">エリア / ジャンル</th>
                <th className="px-5 py-3 font-medium">契約プラン</th>
                <th className="px-5 py-3 font-medium">キャスト数</th>
                <th className="px-5 py-3 font-medium">状態</th>
                <th className="px-5 py-3 font-medium">管理画面ログイン</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(shops ?? []).map((shop) => (
                <tr key={shop.id} className="text-slate-700 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/shops/${shop.id}`}
                      className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                    >
                      {shop.name}
                    </Link>
                    <p className="text-xs text-slate-400">{shop.shop_code}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {shop.area || "-"} / {shop.genre || "-"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                      {PLAN_LABELS[shop.plan] ?? shop.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3">{castCountByShop.get(shop.id) ?? 0}名</td>
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
                    <a
                      href={SHOP_LOGIN_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      ログイン画面を開く ↗
                    </a>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ShopStatusToggle shopId={shop.id} status={shop.status} />
                  </td>
                </tr>
              ))}
              {(shops ?? []).length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
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
