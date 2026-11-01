"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { billingDb } from "@/lib/billing/db";

// 運営(ルート管理者)専用。書き込みはすべてログイン中の運営のセッションで行い、DB側のRLSと関数が権限を再確認する。
// お金は動かさない(記録と計算だけ)。入金の確認と振込は運営が手で行う。

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(f.get(k) ?? 0);
const opt = (v: string) => (v === "" ? null : v);

async function db() {
  return billingDb(await createClient());
}
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------- プラン・割引・規約 ----------
export async function savePlan(formData: FormData) {
  await requireRootAdmin();
  const code = s(formData, "code");
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(code)) throw new Error("プランのコードは、英小文字で始まる英数字とアンダースコア(32文字まで)にしてください");
  const fee = Math.round(n(formData, "monthly_fee"));
  if (!Number.isFinite(fee) || fee < 0) throw new Error("月額は0以上の数字で入力してください");
  const { error } = await (await db()).from("locapass_plans").upsert({
    code,
    name: s(formData, "name") || code,
    monthly_fee: fee,
    description: opt(s(formData, "description")),
    is_public: formData.get("is_public") === "on",
    sort_order: Math.round(n(formData, "sort_order")),
  });
  fail(error);
  revalidatePath("/admin/billing/plans");
}

export async function createPromo(formData: FormData) {
  await requireRootAdmin();
  const kind = s(formData, "kind");
  const value = Math.round(n(formData, "value"));
  const months = Math.round(n(formData, "months"));
  if (kind !== "percent" && kind !== "amount") throw new Error("割引の種類を選んでください");
  if (!(value > 0) || (kind === "percent" && value > 100)) throw new Error("割引の値が正しくありません(%は1〜100)");
  if (!(months >= 1 && months <= 36)) throw new Error("期間は1〜36か月で入力してください");
  const { error } = await (await db()).from("locapass_plan_promos").insert({
    plan_code: s(formData, "plan_code"),
    name: s(formData, "name") || "期間割引",
    kind,
    value,
    months,
    starts_on: opt(s(formData, "starts_on")),
    ends_on: opt(s(formData, "ends_on")),
  });
  fail(error);
  revalidatePath("/admin/billing/plans");
}

export async function setPromoActive(id: string, isActive: boolean) {
  await requireRootAdmin();
  const { error } = await (await db()).from("locapass_plan_promos").update({ is_active: isActive }).eq("id", id);
  fail(error);
  revalidatePath("/admin/billing/plans");
}

export async function createTerms(formData: FormData) {
  await requireRootAdmin();
  const title = s(formData, "title");
  const body = s(formData, "body");
  if (!title || !body) throw new Error("タイトルと本文を入力してください");
  const { error } = await (await db()).from("locapass_contract_terms").insert({ title, body });
  fail(error);
  revalidatePath("/admin/billing/plans");
}

export async function publishTerms(id: string) {
  await requireRootAdmin();
  const { error } = await (await db())
    .from("locapass_contract_terms")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id)
    .is("published_at", null);
  fail(error);
  revalidatePath("/admin/billing/plans");
}

// ---------- 代理店 ----------
export async function saveAgency(formData: FormData) {
  await requireRootAdmin();
  const id = s(formData, "id");
  const kind = s(formData, "kind");
  if (kind !== "corporate" && kind !== "sole_proprietor" && kind !== "referrer") throw new Error("区分を選んでください");
  const rate = n(formData, "default_rate");
  if (!(rate >= 0 && rate <= 100)) throw new Error("標準の料率は0〜100で入力してください");
  const wh = n(formData, "withholding_rate");
  if (!(wh >= 0 && wh <= 100)) throw new Error("源泉徴収の率は0〜100で入力してください");
  const row = {
    name: s(formData, "name"),
    kind,
    invoice_no: opt(s(formData, "invoice_no")),
    default_rate: rate,
    withholding_rate: wh,
    bank_code: opt(s(formData, "bank_code")),
    bank_name: opt(s(formData, "bank_name")),
    branch_code: opt(s(formData, "branch_code")),
    branch_name: opt(s(formData, "branch_name")),
    account_type: opt(s(formData, "account_type")),
    account_no: opt(s(formData, "account_no")),
    account_holder_kana: opt(s(formData, "account_holder_kana")),
    email: opt(s(formData, "email")),
    notes: opt(s(formData, "notes")),
    deduct_invoice_gap: formData.get("deduct_invoice_gap") === "on",
    is_active: formData.get("is_active") === "on",
  };
  if (!row.name) throw new Error("代理店名を入力してください");
  const t = await db();
  const { error } = id ? await t.from("locapass_agencies").update(row).eq("id", id) : await t.from("locapass_agencies").insert(row);
  fail(error);
  revalidatePath("/admin/billing/agencies");
}

export async function linkAgencyShop(formData: FormData) {
  await requireRootAdmin();
  const shopId = s(formData, "shop_id");
  const rateRaw = s(formData, "rate");
  const rate = rateRaw === "" ? null : Number(rateRaw);
  if (rate !== null && !(rate >= 0 && rate <= 100)) throw new Error("料率は0〜100で入力してください");
  const { error } = await (await db()).from("locapass_agency_shops").insert({
    agency_id: s(formData, "agency_id"),
    shop_id: shopId,
    rate,
  });
  if (error?.code === "23505") throw new Error("この店舗にはすでに紹介元の代理店がいます。先に紹介を終了してください");
  fail(error);
  revalidatePath("/admin/billing/agencies");
}

export async function endAgencyLink(id: string) {
  await requireRootAdmin();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { error } = await (await db()).from("locapass_agency_shops").update({ ended_on: today }).eq("id", id).is("ended_on", null);
  fail(error);
  revalidatePath("/admin/billing/agencies");
}

// ---------- 請求・入金確認・振込 ----------
export async function generateInvoices(formData: FormData) {
  await requireRootAdmin();
  const month = s(formData, "month");
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("月が正しくありません");
  const { error } = await (await db()).rpc("locapass_generate_invoices", { p_month: month });
  fail(error);
  revalidatePath("/admin/billing");
}

export async function confirmPaid(invoiceId: string) {
  await requireRootAdmin();
  const { error } = await (await db()).rpc("locapass_confirm_invoice_paid", { p_invoice_id: invoiceId });
  fail(error);
  revalidatePath("/admin/billing");
}

export async function voidInvoice(invoiceId: string) {
  await requireRootAdmin();
  const { error } = await (await db()).rpc("locapass_void_invoice", { p_invoice_id: invoiceId });
  fail(error);
  revalidatePath("/admin/billing");
}

export async function createBatch(formData: FormData) {
  await requireRootAdmin();
  const date = s(formData, "transfer_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("振込日を入力してください");
  const { error } = await (await db()).rpc("locapass_create_payout_batch", { p_transfer_date: date, p_note: opt(s(formData, "note")) });
  fail(error);
  revalidatePath("/admin/billing");
}

export async function markBatchPaid(batchId: string) {
  await requireRootAdmin();
  const { error } = await (await db()).rpc("locapass_mark_batch_paid", { p_batch_id: batchId });
  fail(error);
  revalidatePath("/admin/billing");
}
