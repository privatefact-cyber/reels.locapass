import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole, homePathForRoles, isPartnerOnly, managementLabel, MODE_COOKIE } from "@/lib/auth/roles";

/**
 * ログイン後の振り分け。
 *  - 管理側の立場を持たない会員 → そのままマイページ。
 *  - キャスト・スタッフだけのアカウント → 選択画面なしで、それぞれの画面(/dashboard/cast, /dashboard/staff)へ。
 *  - 管理側の立場(サイト管理・エリア管理・店舗管理・スタッフ・パートナー)を持つアカウント →
 *    「マイページ(個人)」か「管理」かを選ぶ。最後に選んだ立場は覚えて、次回からは直接そちらへ。
 *    ?choose=1 を付けると、覚えていても選択画面を出す。
 */
export default async function DashboardIndexPage({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roles = await fetchMyRoles(supabase);
  if (!roles || !hasManagementRole(roles)) redirect("/mypage");

  // キャスト(FACES)・スタッフだけのアカウントは、選択画面も個人マイページも挟まず、自分の画面へ直接入る。
  if (isPartnerOnly(roles)) redirect(homePathForRoles(roles));

  const { choose } = await searchParams;
  const remembered = (await cookies()).get(MODE_COOKIE)?.value;
  if (!choose) {
    if (remembered === "personal") redirect("/mypage");
    if (remembered === "manage") redirect(homePathForRoles(roles));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-center text-lg font-medium text-main">どちらで使いますか？</h1>
      <Link
        href="/dashboard/go?to=personal"
        className="rounded-2xl border border-main/15 bg-panel-950 p-5 transition hover:border-hl-400/60"
      >
        <p className="text-base font-medium text-main">マイページ（個人）</p>
        <p className="mt-1 text-xs text-tone-500">自分の投稿・いいね・フォロー・お気に入りを見る。</p>
      </Link>
      <Link
        href="/dashboard/go?to=manage"
        className="rounded-2xl border border-main/15 bg-panel-950 p-5 transition hover:border-hl-400/60"
      >
        <p className="text-base font-medium text-main">{managementLabel(roles)}</p>
        <p className="mt-1 text-xs text-tone-500">店舗・ポータルの管理画面を開く。</p>
      </Link>
      <p className="text-center text-[11px] text-tone-600">選んだ立場は次回から自動で開きます。切り替えはヘッダーの「管理」/アイコンから。</p>
    </main>
  );
}
