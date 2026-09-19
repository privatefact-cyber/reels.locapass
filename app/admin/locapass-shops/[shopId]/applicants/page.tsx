import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getLocapassShopForDashboard } from "@/lib/locapass-dashboard/current-shop";
import { ApplicantListMasterDetail } from "@/components/locapass-dashboard/ApplicantListMasterDetail";
import { addApplicant } from "../not-connected";

/**
 * LUXELA本家の応募者管理画面(app/dashboard/applicants/page.tsx)と同じ画面。
 * locapassに応募者・与信照会の受け皿が無いため一覧は空で、登録は「未接続」を返す。
 */
export default async function LocapassShopApplicantsPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const scope = await requireAdmin();
  const shop = await getLocapassShopForDashboard(shopId, scope);
  if (!shop) notFound();

  const applicants: {
    id: string;
    name: string;
    phone: string;
    dob: string | null;
    status: string;
    created_at: string;
    last_check_match_level: string | null;
    last_check_hit_count: number | null;
  }[] = [];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs text-slate-500">{shop?.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">応募者管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          この一覧は自店舗のみに表示されます。他店舗からは見えません。
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">新規応募者を登録</h2>
        <form action={addApplicant} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            name="name"
            required
            placeholder="氏名"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            name="phone"
            required
            placeholder="電話番号"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            name="dob"
            type="date"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="sm:col-span-3 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            登録して与信照会
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">応募者一覧</h2>
        {applicants && applicants.length > 0 ? (
          <ApplicantListMasterDetail applicants={applicants} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">応募者の登録はまだありません。</p>
          </div>
        )}
      </section>
    </div>
  );
}
