import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getLocapassShopForDashboard } from "@/lib/locapass-dashboard/current-shop";
import Link from "next/link";
import { CastListMasterDetail } from "@/components/locapass-dashboard/CastListMasterDetail";
import { CastIdentityFields } from "@/components/locapass-dashboard/CastIdentityFields";
import { addCast } from "../not-connected";

/**
 * LUXELA本家のキャスト管理画面(app/dashboard/cast/page.tsx)と同じ画面。
 * locapassにはキャストの受け皿テーブルがまだ無いため、一覧は空で、登録は「未接続」を返す
 * (LUXELAのcast_membersは読まない)。
 */
export default async function LocapassShopCastPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const scope = await requireAdmin();
  const shop = await getLocapassShopForDashboard(shopId, scope);
  if (!shop) notFound();

  const castMembersWithMedia: {
    id: string;
    name: string;
    age: number | null;
    pr_text: string | null;
    created_at: string;
    media: { url: string }[];
    followerCount: number;
  }[] = [];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">キャスト管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          プロフィール・写真・出勤スケジュール・日記をここから管理できます。
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">新規キャスト登録</h2>
        <form action={addCast} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              name="name"
              required
              placeholder="氏名（源氏名）"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              name="age"
              type="number"
              placeholder="年齢"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              name="pr_text"
              placeholder="PR文"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:col-span-2"
            />
          </div>

          <CastIdentityFields />

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            登録して与信照会
          </button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">在籍キャスト一覧</h2>
          <Link
            href={`/admin/locapass-shops/${shop.id}/cast/roster`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            従業者名簿を出力
          </Link>
        </div>
        {castMembersWithMedia && castMembersWithMedia.length > 0 ? (
          <CastListMasterDetail castMembers={castMembersWithMedia} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">キャストの登録はまだありません。</p>
          </div>
        )}
      </section>
    </div>
  );
}
