import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import Link from "next/link";
import { RosterPrintButton } from "@/components/locapass-dashboard/RosterPrintButton";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

/** LUXELA本家の従業者名簿(app/dashboard/cast/roster/page.tsx)と同じ画面。locapass_cast_membersにつないである。 */
export default async function LocapassShopCastRosterPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  // 本名・住所などを含むため、RLSで自店舗のshop_admin/staffと運営者だけが読める(他店舗は0件)。
  const supabase = await createClient();
  const { data: castMembers } = await supabase
    .from("locapass_cast_members")
    .select("id, name, legal_name, legal_name_kana, birth_date, address, phone, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Link href={`/dashboard/shop/${shop.id}/cast`} className="text-xs text-slate-500 hover:underline">
            ← キャスト管理に戻る
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">従業者名簿</h1>
          <p className="mt-1 text-sm text-slate-600">
            風営法に基づく従業者名簿として、氏名・生年月日・住所・稼働開始日等を出力します。
          </p>
        </div>
        <RosterPrintButton />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 print:border-0 print:p-0">
        <h2 className="mb-1 text-lg font-bold text-slate-900">従業者名簿</h2>
        <p className="mb-4 text-sm text-slate-600">
          {shop.name}　出力日: {new Date().toLocaleDateString("ja-JP")}
        </p>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="p-2">No.</th>
              <th className="p-2">氏名(源氏名)</th>
              <th className="p-2">本名</th>
              <th className="p-2">フリガナ</th>
              <th className="p-2">生年月日</th>
              <th className="p-2">住所</th>
              <th className="p-2">電話番号</th>
              <th className="p-2">稼働開始日</th>
            </tr>
          </thead>
          <tbody>
            {(castMembers ?? []).map((c, i) => (
              <tr key={c.id} className="border-b border-slate-300">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.legal_name ?? "-"}</td>
                <td className="p-2">{c.legal_name_kana ?? "-"}</td>
                <td className="p-2">{formatDate(c.birth_date)}</td>
                <td className="p-2">{c.address ?? "-"}</td>
                <td className="p-2">{c.phone ?? "-"}</td>
                <td className="p-2">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!castMembers || castMembers.length === 0) && (
          <p className="mt-4 text-sm text-slate-500">キャストの登録はまだありません。</p>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
