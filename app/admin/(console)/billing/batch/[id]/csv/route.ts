import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { billingDb } from "@/lib/billing/db";

export const dynamic = "force-dynamic";

// 振込のまとまり1つぶんの、代理店ごとの振込一覧(UTF-8、Excelで開ける)。
// 全銀フォーマット(銀行のネットバンクに取り込む固定長ファイル)ではない。取り込み形式は銀行ごとに違うため、銀行が決まってから対応する。
const q = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRootAdmin();
  const { id } = await params;
  const t = billingDb(await createClient());

  const { data: batch } = await t.from("locapass_payout_batches").select("transfer_date").eq("id", id).maybeSingle();
  if (!batch) return new Response("not found", { status: 404 });

  const { data: rows } = await t
    .from("locapass_commissions")
    .select("agency_id, commission, withholding, tax_adjustment")
    .eq("batch_id", id);
  const byAgency = new Map<string, { gross: number; wh: number; adj: number; n: number }>();
  for (const r of (rows ?? []) as { agency_id: string; commission: number; withholding: number; tax_adjustment: number }[]) {
    const cur = byAgency.get(r.agency_id) ?? { gross: 0, wh: 0, adj: 0, n: 0 };
    cur.gross += r.commission;
    cur.wh += r.withholding;
    cur.adj += r.tax_adjustment;
    cur.n += 1;
    byAgency.set(r.agency_id, cur);
  }
  const ids = [...byAgency.keys()];
  const { data: agencies } = ids.length ? await t.from("locapass_agencies").select("*").in("id", ids) : { data: [] };

  const header = ["振込日", "代理店名", "銀行コード", "銀行名", "支店コード", "支店名", "預金種目", "口座番号", "受取人名(カナ)", "手数料", "源泉徴収", "消費税の差額", "振込金額", "件数"];
  const lines = [header.map(q).join(",")];
  for (const a of (agencies ?? []) as Record<string, string>[]) {
    const v = byAgency.get(a.id)!;
    lines.push(
      [batch.transfer_date, a.name, a.bank_code, a.bank_name, a.branch_code, a.branch_name, a.account_type, a.account_no, a.account_holder_kana, v.gross, v.wh, v.adj, v.gross - v.wh - v.adj, v.n]
        .map(q)
        .join(","),
    );
  }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-${batch.transfer_date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
