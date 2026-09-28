import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { headers } from "next/headers";
import { InviteStaffButton } from "@/components/locapass-dashboard/InviteStaffButton";
import { StaffLoginLinkCard } from "@/components/locapass-dashboard/StaffLoginLinkCard";
import { RestoreMemberButton } from "@/components/locapass-dashboard/RestoreMemberButton";
import { createClient } from "@/lib/supabase/server";
import {
  addStaffMember,
  deleteStaffMember,
  restoreStaffMember,
  regenerateStaffLoginToken,
  issueStaffLoginPin,
} from "./actions";

const RESTORE_WINDOW_DAYS = 30;

/**
 * LUXELA本家のスタッフ管理画面(app/dashboard/staff/page.tsx)と同じ画面。
 * locapass_shop_staff_members / locapass_staff_login_tokens につないである。
 */
export default async function LocapassShopStaffPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  const { data: staffRows } = await supabase
    .from("locapass_shop_staff_members")
    .select("id, name, avatar_url, user_id, created_at, locapass_staff_login_tokens ( token, pin_hash )")
    .eq("shop_id", shop.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  // 本家の列名(staff_login_tokens)に揃える。
  const staffMembers = (staffRows ?? []).map((s) => ({ ...s, staff_login_tokens: s.locapass_staff_login_tokens }));

  // 退店から30日以内は復帰可能な状態で一覧に出す(それより古いものは復帰対象外なので出さない)。
  const restoreCutoff = new Date(Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: deletedStaffMembers } = await supabase
    .from("locapass_shop_staff_members")
    .select("id, name, deleted_at")
    .eq("shop_id", shop.id)
    .not("deleted_at", "is", null)
    .gt("deleted_at", restoreCutoff)
    .order("deleted_at", { ascending: false });

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">スタッフ管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          黒服・店長など、個人単位のアカウントを発行できます。各スタッフは専用マイページ(リール投稿・イベント投稿・お問い合わせ対応・プロフィール編集)を持ち、自分が投稿したものだけを編集・削除できます。
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">スタッフを追加</h2>
        <form action={addStaffMember.bind(null, shop.id)} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="名前"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            追加
          </button>
        </form>
      </section>

      <div className="space-y-4">
        {(staffMembers ?? []).map((s) => {
          const tokenRow = Array.isArray(s.staff_login_tokens)
            ? s.staff_login_tokens[0]
            : s.staff_login_tokens;
          const loginUrl = tokenRow ? `${origin}/staff/link/${tokenRow.token}` : null;
          const boundRegenerate = regenerateStaffLoginToken.bind(null, shop.id, s.id);

          return (
            <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {s.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                      {s.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400">
                      {s.user_id ? "ログイン発行済み" : "ログイン未発行"}
                    </p>
                  </div>
                </div>
                <form action={deleteStaffMember.bind(null, shop.id, s.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                    削除
                  </button>
                </form>
              </div>

              <div className="mt-3">
                <InviteStaffButton shopId={shop.id} staffMemberId={s.id} hasLogin={!!s.user_id} />
              </div>

              {s.user_id && loginUrl && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    マイページ用リンク(URL紛失・ログアウト時もいつでも再確認・再送できます)
                  </p>
                  <StaffLoginLinkCard
                    staffName={s.name}
                    loginUrl={loginUrl}
                    regenerateAction={boundRegenerate}
                    hasPin={!!tokenRow?.pin_hash}
                    issuePin={issueStaffLoginPin.bind(null, shop.id, s.id)}
                  />
                </div>
              )}
            </section>
          );
        })}
        {(!staffMembers || staffMembers.length === 0) && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            まだスタッフが登録されていません。
          </p>
        )}
      </div>

      {deletedStaffMembers && deletedStaffMembers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">退店済み(30日以内は復帰可能)</h2>
          <p className="mb-4 text-xs text-slate-500">
            退店から30日を過ぎると復帰できなくなります。復帰させるとアカウント・ログイン情報はそのまま戻ります。
          </p>
          <div className="space-y-2">
            {deletedStaffMembers.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    退店日: {new Date(s.deleted_at as string).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <RestoreMemberButton action={restoreStaffMember.bind(null, shop.id, s.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
