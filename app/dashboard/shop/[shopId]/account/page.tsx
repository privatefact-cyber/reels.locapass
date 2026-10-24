import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { ShopAccountSettingsSection } from "@/components/locapass-dashboard/ShopAccountSettingsSection";

/**
 * アカウント(自分のログインIDの確認・パスワードの変更)。
 * 以前は「店舗情報」ページの途中にしかなく、見つけにくかったので、メニューから開ける専用ページにした。
 */
export default async function LocapassShopAccountPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">アカウント</h1>
        <p className="mt-1 text-sm text-slate-600">ご自分のログインIDの確認と、パスワードの変更ができます。パスワードは、いつでも変更できます。</p>
      </div>
      {viewer.isOperator ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">運営として閲覧しているため、ここでは、店舗のIDやパスワードは表示・変更できません。</p>
      ) : (
        <>
          <ShopAccountSettingsSection />
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-xs leading-relaxed text-slate-600">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">パスワードを忘れたとき</h2>
            <p>発行されたIDは、メールを受け取れないIDのため、ログイン画面の「メールで再設定」は使えません。ログインできないときは、
              <a href="/shop-recover" className="text-slate-900 underline">こちら(電話番号・生年月日・暗証番号で再設定)</a>
              から手続きするか、管理者IDの追加が使える場合は、オーナーの方に、新しいIDを発行してもらってください。</p>
          </section>
        </>
      )}
    </div>
  );
}
