import { startImpersonation } from "@/app/admin/(console)/actions";

export function EnterShopDashboardButton({ shopId }: { shopId: string }) {
  return (
    <form action={startImpersonation.bind(null, shopId)}>
      <button
        type="submit"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
      >
        この店舗の管理画面に入る
      </button>
    </form>
  );
}
