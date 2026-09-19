import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getLocapassShopForDashboard } from "@/lib/locapass-dashboard/current-shop";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  responded: "対応済み",
  closed: "クローズ",
};

/**
 * LUXELA本家のお問い合わせ画面(app/dashboard/inquiries/page.tsx)と同じ画面。
 * locapassに問い合わせの受け皿テーブルが無いため空表示(LUXELAのshop_inquiriesは読まない)。
 */
export default async function LocapassShopInquiriesPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const scope = await requireAdmin();
  const shop = await getLocapassShopForDashboard(shopId, scope);
  if (!shop) notFound();

  const inquiries: {
    id: string;
    customer_name: string | null;
    contact: string | null;
    status: string;
    updated_at: string;
  }[] = [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">お問い合わせ</h1>
        <p className="mt-1 text-sm text-slate-600">
          一般ユーザーから届いた来店予約・問い合わせDMです。キャストへの個別DMはありません。
        </p>
      </div>

      {inquiries && inquiries.length > 0 ? (
        <ul className="divide-y divide-black/10 rounded-lg border border-slate-200 bg-white">
          {inquiries.map((inq) => (
            <li key={inq.id}>
              <Link
                href={`/admin/locapass-shops/${shop.id}/inquiries/${inq.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{inq.customer_name || "名前未入力"}</p>
                  <p className="truncate text-xs text-slate-500">{inq.contact || "連絡先未入力"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      inq.status === "open"
                        ? "bg-amber-100 text-amber-700"
                        : inq.status === "responded"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {STATUS_LABEL[inq.status] ?? inq.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(inq.updated_at).toLocaleString("ja-JP")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          まだお問い合わせはありません。
        </p>
      )}
    </div>
  );
}
