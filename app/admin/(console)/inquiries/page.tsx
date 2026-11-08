import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStatus, STATUS_LABEL, STATUS_STYLE, STATUSES, TYPE_LABEL, type InquiryStatus, type InquiryType } from "@/lib/lpInquiry/shared";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: InquiryType;
  status: InquiryStatus;
  subject: string;
  name: string;
  contact: string;
  area: string | null;
  note: string | null;
  created_at: string;
  last_replied_at: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** LPの問い合わせ(掲載店・販売代理店)の履歴。状態ごとの件数と、一覧から詳細(返信)へ。 */
export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const statusFilter = isStatus(sp.status) ? sp.status : null;
  const typeFilter: InquiryType | null = sp.type === "shop" || sp.type === "agency" ? sp.type : null;

  const { data } = await (createAdminClient() as any)
    .from("locapass_lp_inquiries")
    .select("id, type, status, subject, name, contact, area, note, created_at, last_replied_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []) as Row[];

  // 件数は、種別の絞り込みだけをかけた中での、状態ごとの数。
  const byType = typeFilter ? all.filter((r) => r.type === typeFilter) : all;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, byType.filter((r) => r.status === s).length])) as Record<InquiryStatus, number>;
  const rows = byType.filter((r) => !statusFilter || r.status === statusFilter);

  const href = (status: InquiryStatus | null, type: InquiryType | null) => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (type) q.set("type", type);
    const s = q.toString();
    return s ? `/admin/inquiries?${s}` : "/admin/inquiries";
  };
  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`;

  return (
    <div className="max-w-5xl space-y-5 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">お問い合わせ</h1>
        <p className="mt-1 text-sm text-slate-600">LPの「掲載のお問い合わせ」「販売代理店のお問い合わせ」から届いた内容です。状態の確認と、返信ができます。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={"/admin/inquiries/export" + (statusFilter || typeFilter ? "?" + new URLSearchParams({ ...(statusFilter ? { status: statusFilter } : {}), ...(typeFilter ? { type: typeFilter } : {}) }).toString() : "")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          CSVで書き出す{statusFilter || typeFilter ? "(いまの絞り込み)" : ""}
        </a>
        <Link href="/admin/inquiries/import" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          過去の問い合わせを取り込む
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <Link key={s} href={href(s, typeFilter)} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>
            <p className="mt-2 text-3xl font-bold tabular-nums">{counts[s]}</p>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">状態:</span>
        <Link href={href(null, typeFilter)} className={pill(!statusFilter)}>すべて {byType.length}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={href(s, typeFilter)} className={pill(statusFilter === s)}>{STATUS_LABEL[s]} {counts[s]}</Link>
        ))}
        <span className="ml-3 text-sm font-semibold text-slate-600">種別:</span>
        <Link href={href(statusFilter, null)} className={pill(!typeFilter)}>すべて</Link>
        {(["shop", "agency"] as const).map((t) => (
          <Link key={t} href={href(statusFilter, t)} className={pill(typeFilter === t)}>{TYPE_LABEL[t]}</Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">該当するお問い合わせはありません。</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/inquiries/${r.id}`} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-slate-50">
                <span className={`mt-0.5 w-20 shrink-0 rounded-full px-2.5 py-0.5 text-center text-xs font-bold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {r.subject}
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{TYPE_LABEL[r.type]}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {r.name} ・ {r.contact}
                    {r.area ? ` ・ ${r.area}` : ""}
                  </p>
                  {r.note && <p className="mt-1 line-clamp-1 text-xs text-slate-600">{r.note}</p>}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <p>{fmt(r.created_at)}</p>
                  {r.last_replied_at && <p className="text-emerald-700">返信 {fmt(r.last_replied_at)}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
