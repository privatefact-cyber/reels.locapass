import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { CastListMasterDetail } from "@/components/dashboard/CastListMasterDetail";
import { CastIdentityFields } from "@/components/dashboard/CastIdentityFields";
import { addCast } from "./actions";

export default async function CastListPage() {
  const shop = await requireCurrentShop();
  if (!shop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();
  const { data: castMembers } = await supabase
    .from("cast_members")
    .select("id, name, age, pr_text, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  // Fetch media + follower count for each cast member
  const castMembersWithMedia = await Promise.all(
    (castMembers ?? []).map(async (cast) => {
      const [{ data: media }, { data: followerCount }] = await Promise.all([
        supabase
          .from("media")
          .select("url")
          .eq("cast_id", cast.id)
          .order("display_order", { ascending: true })
          .limit(1),
        supabase.rpc("count_cast_followers", { p_cast_id: cast.id }),
      ]);
      return {
        ...cast,
        media: media ?? [],
        followerCount: followerCount ?? 0,
      };
    })
  );

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
            href="/dashboard/cast/roster"
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
