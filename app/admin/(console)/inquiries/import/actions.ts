"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/lpInquiry/csv";
import { parseCsvInquiries, parseMailBodies, type ParsedInquiry } from "@/lib/lpInquiry/importParse";
import { extractEmail, isStatus, type InquiryStatus, type InquiryType } from "@/lib/lpInquiry/shared";

const MAX_ROWS = 500;
const MAX_CHARS = 2_000_000;

function back(tone: "ok" | "ng", message: string, errors: string[] = []): never {
  const q = new URLSearchParams({ tone, notice: message });
  if (errors.length) q.set("errors", errors.slice(0, 8).join(" / ") + (errors.length > 8 ? " ほか" + (errors.length - 8) + "件" : ""));
  redirect("/admin/inquiries/import?" + q.toString());
}

function defaults(formData: FormData): { type: InquiryType; status: InquiryStatus } {
  const type: InquiryType = formData.get("default_type") === "agency" ? "agency" : "shop";
  const raw = String(formData.get("default_status") ?? "");
  return { type, status: isStatus(raw) ? raw : "closed" };
}

/** 同じ種別・店舗名・連絡先・ご相談内容のものは、すでにある問い合わせとして取り込まない(二重に取り込まないため)。 */
async function insertAll(items: ParsedInquiry[], defaultStatus: InquiryStatus) {
  const admin = createAdminClient() as any;
  let added = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const it of items) {
    let q = admin.from("locapass_lp_inquiries").select("id", { count: "exact", head: true }).eq("type", it.type).eq("subject", it.subject).eq("contact", it.contact);
    q = it.note ? q.eq("note", it.note) : q.is("note", null);
    const { count, error: findError } = await q;
    if (findError) {
      failed.push(it.subject + ": " + findError.message);
      continue;
    }
    if ((count ?? 0) > 0) {
      skipped++;
      continue;
    }
    const { error } = await admin.from("locapass_lp_inquiries").insert({
      type: it.type,
      status: it.status ?? defaultStatus,
      subject: it.subject,
      name: it.name,
      contact: it.contact,
      email: extractEmail(it.contact),
      area: it.area,
      details: it.details,
      note: it.note,
      source_page: "import",
      ...(it.createdAt ? { created_at: it.createdAt } : {}),
    });
    if (error) failed.push(it.subject + ": " + error.message);
    else added++;
  }
  return { added, skipped, failed };
}

async function finish(items: ParsedInquiry[], parseErrors: string[], defaultStatus: InquiryStatus) {
  if (items.length === 0) back("ng", "取り込める問い合わせがありませんでした", parseErrors);
  if (items.length > MAX_ROWS) back("ng", "一度に取り込めるのは" + MAX_ROWS + "件までです(" + items.length + "件ありました)。分けて取り込んでください");
  const { added, skipped, failed } = await insertAll(items, defaultStatus);
  revalidatePath("/admin/inquiries");
  const problems = [...parseErrors, ...failed];
  const summary = added + "件を取り込みました" + (skipped ? "(すでにある" + skipped + "件は取り込みませんでした)" : "") + (problems.length ? "。読み取れなかったものが" + problems.length + "件あります" : "");
  back(added > 0 || problems.length === 0 ? "ok" : "ng", summary, problems);
}

/** CSV(貼り付け、またはファイル)から取り込む。1行目が見出し。書き出したCSVをそのまま読める。 */
export async function importCsv(formData: FormData) {
  await requireRootAdmin();
  const { type, status } = defaults(formData);
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");
  if (!text.trim() && file instanceof File && file.size > 0) text = await file.text();
  if (!text.trim()) back("ng", "CSVを貼り付けるか、ファイルを選んでください");
  if (text.length > MAX_CHARS) back("ng", "データが大きすぎます。分けて取り込んでください");
  const { items, errors } = parseCsvInquiries(parseCsv(text), type);
  await finish(items, errors, status);
}

/** 過去のお問い合わせメールの本文(店舗名:〇〇、連絡先:〇〇…の行)から取り込む。複数は「====」の行で区切る。 */
export async function importMail(formData: FormData) {
  await requireRootAdmin();
  const { type, status } = defaults(formData);
  const text = String(formData.get("mail") ?? "");
  if (!text.trim()) back("ng", "メールの本文を貼り付けてください");
  if (text.length > MAX_CHARS) back("ng", "データが大きすぎます。分けて取り込んでください");
  const { items, errors } = parseMailBodies(text, type);
  await finish(items, errors, status);
}
