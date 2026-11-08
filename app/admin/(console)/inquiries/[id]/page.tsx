import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMailConfigured } from "@/lib/lpInquiry/mail";
import { STATUS_LABEL, STATUS_STYLE, STATUSES, TYPE_LABEL, type InquiryStatus, type InquiryType } from "@/lib/lpInquiry/shared";
import { addInquiryNote, recordReply, replyByEmail, setInquiryStatus } from "../actions";
import { ReplyComposer } from "../ReplyComposer";

export const dynamic = "force-dynamic";

const DETAIL_LABEL: Record<string, string> = { genre: "業種", url: "公式サイト・SNS", biz: "事業内容", description: "ご相談内容(詳細)", tel: "電話番号" };
const KIND_LABEL: Record<string, { label: string; style: string }> = {
  reply_email: { label: "メールで返信", style: "bg-emerald-100 text-emerald-800" },
  reply_manual: { label: "返信を記録", style: "bg-sky-100 text-sky-800" },
  note: { label: "社内メモ", style: "bg-amber-100 text-amber-900" },
};
const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

export default async function AdminInquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tone?: string; notice?: string }>;
}) {
  await requireRootAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient() as any;
  const { data: inquiry } = await admin.from("locapass_lp_inquiries").select("*").eq("id", id).maybeSingle();
  if (!inquiry) notFound();
  const { data: messages } = await admin
    .from("locapass_lp_inquiry_messages")
    .select("id, kind, body, to_email, created_at")
    .eq("inquiry_id", id)
    .order("created_at", { ascending: true });

  const status = inquiry.status as InquiryStatus;
  const type = inquiry.type as InquiryType;
  const details = Object.entries((inquiry.details ?? {}) as Record<string, string>).filter(([, v]) => v);
  const rows: [string, string | null][] = [
    ["種別", TYPE_LABEL[type]],
    [type === "shop" ? "店舗名・施設名" : "会社名", inquiry.subject],
    ["ご担当者名", inquiry.name],
    ["連絡先", inquiry.contact],
    ["所在地", inquiry.area],
    ...details.map(([k, v]): [string, string] => [DETAIL_LABEL[k] ?? k, v]),
    ["受付日時", fmt(inquiry.created_at)],
  ];

  return (
    <div className="max-w-3xl space-y-5 text-slate-900">
      <Link href="/admin/inquiries" className="text-sm font-semibold text-blue-700 hover:underline">← お問い合わせ一覧</Link>

      {sp.notice && (
        <p className={`rounded-xl border px-4 py-3 text-sm font-semibold ${sp.tone === "ng" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{sp.notice}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{inquiry.subject}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs font-semibold text-slate-500">{k}</dt>
              <dd className="break-all text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {inquiry.note && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">ご相談内容・ご質問</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{inquiry.note}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">状態</h2>
        <form action={setInquiryStatus.bind(null, id)} className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              name="status"
              value={s}
              disabled={s === status}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${s === status ? `cursor-default border-transparent ${STATUS_STYLE[s]}` : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`}
            >
              {STATUS_LABEL[s]}
              {s === status ? "(いま)" : ""}
            </button>
          ))}
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">履歴</h2>
        {(messages ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">まだ返信やメモはありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(messages as { id: string; kind: string; body: string; to_email: string | null; created_at: string }[]).map((m) => {
              const k = KIND_LABEL[m.kind] ?? { label: m.kind, style: "bg-slate-100 text-slate-700" };
              return (
                <li key={m.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2.5 py-0.5 font-bold ${k.style}`}>{k.label}</span>
                    <span>{fmt(m.created_at)}</span>
                    {m.to_email && <span>宛先: {m.to_email}</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ReplyComposer
        email={inquiry.email}
        mailConfigured={isMailConfigured()}
        defaultSubject={`【LOCAPASS】${TYPE_LABEL[type]}のお問い合わせについて`}
        sendEmail={replyByEmail.bind(null, id)}
        record={recordReply.bind(null, id)}
      />

      <form action={addInquiryNote.bind(null, id)} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">社内メモ</h2>
        <textarea name="note" rows={3} maxLength={5000} required placeholder="電話した、見積もりを出した、など(お客様には送られません)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">メモを保存</button>
      </form>
    </div>
  );
}
