import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";

const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  responded: "対応済み",
  closed: "クローズ",
};

export default async function DashboardInquiriesPage() {
  const shop = await requireCurrentShop();
  if (!shop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();
  const { data: inquiries } = await supabase
    .from("shop_inquiries")
    .select("id, customer_name, contact, status, created_at, updated_at")
    .eq("shop_id", shop.id)
    .order("updated_at", { ascending: false });

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
                href={`/dashboard/inquiries/${inq.id}`}
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
