import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv } from "@/lib/lpInquiry/csv";
import { isStatus, STATUS_LABEL, TYPE_LABEL, type InquiryType } from "@/lib/lpInquiry/shared";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { reply_email: "メールで返信", reply_manual: "返信を記録", note: "社内メモ" };

const jst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16).replace(/-/g, "/") : "";

/**
 * お問い合わせの一覧をCSVで書き出す(Excel/スプレッドシートで開ける)。一覧の絞り込み(?status=&type=)をそのまま使える。
 * 見出しは、取り込み(/admin/inquiries/import)で読める名前にそろえてある。
 */
export async function GET(req: Request) {
  await requireRootAdmin();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const type = sp.get("type");
  const admin = createAdminClient() as any;

  let query = admin.from("locapass_lp_inquiries").select("*").order("created_at", { ascending: false }).limit(5000);
  if (isStatus(status)) query = query.eq("status", status);
  if (type === "shop" || type === "agency") query = query.eq("type", type);
  const { data, error } = await query;
  if (error) return new Response("書き出しに失敗しました: " + error.message, { status: 500 });
  const rows = (data ?? []) as Record<string, any>[];

  // 返信・メモの履歴を、問い合わせごとにまとめる。
  const history = new Map<string, string[]>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id as string);
    const { data: msgs } = await admin
      .from("locapass_lp_inquiry_messages")
      .select("inquiry_id, kind, body, created_at")
      .in("inquiry_id", ids)
      .order("created_at", { ascending: true });
    for (const m of (msgs ?? []) as { inquiry_id: string; kind: string; body: string; created_at: string }[]) {
      const list = history.get(m.inquiry_id) ?? [];
      list.push("[" + jst(m.created_at) + " " + (KIND_LABEL[m.kind] ?? m.kind) + "] " + m.body);
      history.set(m.inquiry_id, list);
    }
  }

  const header = ["受付日時", "種別", "状態", "店舗名・会社名", "ご担当者名", "連絡先", "メールアドレス", "電話番号", "所在地", "業種", "事業内容", "事業の詳細", "URL", "ご相談内容", "返信日時", "対応履歴"];
  const body = rows.map((r) => {
    const d = (r.details ?? {}) as Record<string, string>;
    return [
      jst(r.created_at),
      TYPE_LABEL[r.type as InquiryType] ?? r.type,
      STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status,
      r.subject ?? "",
      r.name ?? "",
      r.contact ?? "",
      r.email ?? "",
      d.tel ?? "",
      r.area ?? "",
      d.genre ?? "",
      d.biz ?? "",
      d.description ?? "",
      d.url ?? "",
      r.note ?? "",
      jst(r.last_replied_at),
      (history.get(r.id) ?? []).join("\n"),
    ];
  });

  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(/-/g, "");
  return new Response(toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"inquiries-" + stamp + ".csv\"",
      "Cache-Control": "no-store",
    },
  });
}
