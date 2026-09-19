import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles } from "@/lib/auth/roles";

/**
 * shop_admin の入口。担当店舗が1つならその店舗の管理画面へ、複数なら選択画面を出す。
 * 表示するのは locapass_shop_admins に本人の行がある店舗だけ(他店舗は出さない)。
 */
export default async function ShopDashboardIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/shop");

  const roles = await fetchMyRoles(supabase);
  const shopIds = roles?.shop_admin_shop_ids ?? [];
  if (shopIds.length === 0) redirect("/dashboard");
  if (shopIds.length === 1) redirect(`/dashboard/shop/${shopIds[0]}`);

  const { data: shops } = await supabase
    .from("locapass_shops")
    .select("id, name, category")
    .in("id", shopIds)
    .order("name", { ascending: true });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">管理する店舗を選択</h1>
        <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(shops ?? []).map((shop) => (
            <li key={shop.id}>
              <Link
                href={`/dashboard/shop/${shop.id}`}
                className="flex items-center justify-between px-5 py-4 text-sm hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-900">{shop.name}</span>
                <span className="text-xs text-slate-400">{shop.category ?? ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
