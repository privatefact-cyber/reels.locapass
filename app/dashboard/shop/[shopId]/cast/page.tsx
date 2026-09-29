import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import Link from "next/link";
import { CastListMasterDetail } from "@/components/locapass-dashboard/CastListMasterDetail";
import { CastIdentityFields } from "@/components/locapass-dashboard/CastIdentityFields";
import { RestoreMemberButton } from "@/components/locapass-dashboard/RestoreMemberButton";
import { createClient } from "@/lib/supabase/server";
import { addCast, restoreCast } from "./actions";

const RESTORE_WINDOW_DAYS = 30;

/**
 * LUXELA本家のキャスト管理画面(app/dashboard/cast/page.tsx)と同じ画面。
 * locapass_cast_members / locapass_media / locapass_cast_follows(フォロワー数)につないである。
 */
export default async function LocapassShopCastPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  const { data: castMembers } = await supabase
    .from("locapass_cast_members")
    .select("id, name, age, pr_text, created_at")
    .eq("shop_id", shop.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // 退店から30日以内は復帰可能な状態で一覧に出す(それより古いものは復帰対象外なので出さない)。
  const restoreCutoff = new Date(Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: deletedCastMembers } = await supabase
    .from("locapass_cast_members")
    .select("id, name, deleted_at")
    .eq("shop_id", shop.id)
    .not("deleted_at", "is", null)
    .gt("deleted_at", restoreCutoff)
    .order("deleted_at", { ascending: false });

  // 各パートナーの先頭写真とフォロワー数(本家と同じく1人ずつ取得)。
  const castMembersWithMedia = await Promise.all(
    (castMembers ?? []).map(async (cast) => {
      const [{ data: media }, { data: followerCount }] = await Promise.all([
        supabase
          .from("locapass_media")
          .select("url")
          .eq("cast_id", cast.id)
          .order("display_order", { ascending: true })
          .limit(1),
        supabase.rpc("locapass_count_cast_followers", { p_cast_id: cast.id }),
      ]);
      return {
        ...cast,
        media: media ?? [],
        followerCount: followerCount ?? 0,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">FACES管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          プロフィール・写真・出勤スケジュール・日記をここから管理できます。
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">新規FACES登録</h2>
        <form action={addCast.bind(null, shop.id)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              name="name"
              required
              placeholder="氏名（活動名）"
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
          <h2 className="text-sm font-semibold text-slate-900">FACES一覧</h2>
          <Link
            href={`/dashboard/shop/${shop.id}/cast/roster`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            従業者名簿を出力
          </Link>
        </div>
        {castMembersWithMedia && castMembersWithMedia.length > 0 ? (
          <CastListMasterDetail castMembers={castMembersWithMedia} detailBasePath={`/dashboard/shop/${shop.id}/cast`} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">FACESの登録はまだありません。</p>
          </div>
        )}
      </section>

      {deletedCastMembers && deletedCastMembers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">退店済み(30日以内は復帰可能)</h2>
          <p className="mb-4 text-xs text-slate-500">
            退店から30日を過ぎると復帰できなくなります。復帰させるとアカウント・ログイン情報・投稿履歴はそのまま戻ります。
          </p>
          <div className="space-y-2">
            {deletedCastMembers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">{c.name}</p>
                  <p className="text-xs text-slate-400">
                    退店日: {new Date(c.deleted_at as string).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <RestoreMemberButton action={restoreCast.bind(null, shop.id, c.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}