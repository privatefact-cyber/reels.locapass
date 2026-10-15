import { createAdminClient } from "@/lib/supabase/admin";
import {
  CUSTOMER_CANCEL_HOURS,
  DEPOSIT_AMOUNT,
  MAX_DAYS_AHEAD,
  MAX_OPEN_PER_USER,
  MIN_LEAD_HOURS,
  reservationEnabled,
  shopCanTakeReservations,
  type ReservationRow,
} from "./config";
import { paymentProvider } from "./payment";
import { notifyShopAdmins, notifyUsers } from "./notify";

/** サーバー(service role)専用。予約・決済状態の書き込みはここだけを通す。 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const HOUR = 3600_000;
const fmtJst = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

// supabase-js の型は巨大で予約テーブルが未生成のため、このファイルでは緩い型で扱う。
const db = () => createAdminClient() as any;

export type CreateInput = { shopId: string; partySize: number; reserveAt: string; contactName: string; contactPhone: string; note: string | null };

export async function createReservation(userId: string, input: CreateInput): Promise<Result<{ id: string }>> {
  if (!reservationEnabled()) return { ok: false, error: "現在、優先予約は受け付けていません" };
  const admin = db();

  const at = new Date(input.reserveAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(at)) return { ok: false, error: "日時が正しくありません" };
  if (at < now + MIN_LEAD_HOURS * HOUR) return { ok: false, error: `来店の${MIN_LEAD_HOURS}時間前までにお申し込みください` };
  if (at > now + MAX_DAYS_AHEAD * 24 * HOUR) return { ok: false, error: `予約は${MAX_DAYS_AHEAD}日先までです` };
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 20) return { ok: false, error: "人数が正しくありません" };
  const name = input.contactName.trim();
  const phone = input.contactPhone.replace(/[\s\-()]/g, "");
  if (!name || name.length > 40) return { ok: false, error: "お名前を入力してください" };
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { ok: false, error: "電話番号を正しく入力してください" };
  const note = input.note?.trim() || null;
  if (note && note.length > 300) return { ok: false, error: "ご要望は300文字以内にしてください" };

  const { data: shop } = await admin.from("locapass_shops").select("id, name, plan, status").eq("id", input.shopId).maybeSingle();
  if (!shop || shop.status !== "active" || !shopCanTakeReservations(shop.plan)) return { ok: false, error: "このお店は優先予約を受け付けていません" };

  const { count } = await admin
    .from("locapass_reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["requested", "confirmed"])
    .gt("reserve_at", new Date().toISOString());
  if ((count ?? 0) >= MAX_OPEN_PER_USER) return { ok: false, error: `同時にお申し込みできるのは${MAX_OPEN_PER_USER}件までです` };

  const id = crypto.randomUUID();
  const provider = paymentProvider();
  // 与信(仮決済)に成功してから予約を作る。失敗したら予約は作らない。
  const pay = await provider.authorize({ reservationKey: id, amount: DEPOSIT_AMOUNT });
  if (!pay.ok) return { ok: false, error: `決済の確認に失敗しました: ${pay.error}` };

  const { error } = await admin.from("locapass_reservations").insert({
    id,
    shop_id: shop.id,
    user_id: userId,
    party_size: input.partySize,
    reserve_at: new Date(at).toISOString(),
    note,
    contact_name: name,
    contact_phone: phone,
    deposit_amount: DEPOSIT_AMOUNT,
    payment_provider: provider.name,
    payment_status: "authorized",
    payment_ref: pay.ref,
  });
  if (error) {
    await provider.release(pay.ref).catch(() => {});
    return { ok: false, error: "予約を作成できませんでした" };
  }

  await notifyShopAdmins(shop.id, {
    type: "reservation_request",
    title: "優先予約のリクエストが届きました",
    body: `${fmtJst(new Date(at).toISOString())} ${input.partySize}名 ${name}様`,
    url: `/dashboard/shop/${shop.id}/reservations`,
  }).catch(() => {});
  return { ok: true, id };
}

async function loadForShop(shopId: string, id: string): Promise<ReservationRow | null> {
  const { data } = await db().from("locapass_reservations").select("*").eq("id", id).eq("shop_id", shopId).maybeSingle();
  return data ?? null;
}

/** 状態を from → to へ原子的に進める(同時操作・二重押しの防止)。 */
async function transition(id: string, from: string[], patch: Record<string, unknown>): Promise<ReservationRow | null> {
  const { data } = await db()
    .from("locapass_reservations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", from)
    .select("*");
  return data?.[0] ?? null;
}

async function revert(id: string, status: string) {
  await db().from("locapass_reservations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

/** 店の判断: 受ける(確定。枠は保持)/ 断る(仮決済を解放=請求0円)。権限確認は呼び出し側(getShopForManager)。 */
export async function respondReservation(shopId: string, id: string, accept: boolean, message: string | null): Promise<Result> {
  const cur = await loadForShop(shopId, id);
  if (!cur) return { ok: false, error: "予約が見つかりません" };
  if (cur.status !== "requested") return { ok: false, error: "すでに対応済みです" };
  const msg = message?.trim().slice(0, 300) || null;
  const now = new Date().toISOString();

  if (accept) {
    const row = await transition(id, ["requested"], { status: "confirmed", shop_message: msg, responded_at: now });
    if (!row) return { ok: false, error: "すでに対応済みです" };
    await notifyUsers([cur.user_id], {
      type: "reservation_confirmed",
      title: "予約が確定しました",
      body: `${fmtJst(cur.reserve_at)} ${cur.party_size}名。お待ちしております。要望があれば店舗へご連絡ください。`,
      url: "/mypage/reservations",
    }).catch(() => {});
    return { ok: true };
  }

  const row = await transition(id, ["requested"], { status: "declined", shop_message: msg, responded_at: now });
  if (!row) return { ok: false, error: "すでに対応済みです" };
  const rel = cur.payment_ref ? await paymentProvider().release(cur.payment_ref) : ({ ok: true, ref: "" } as const);
  if (!rel.ok) {
    await revert(id, "requested");
    return { ok: false, error: `仮決済の解放に失敗しました: ${rel.error}` };
  }
  await db().from("locapass_reservations").update({ payment_status: "released", settled_at: now }).eq("id", id);
  await notifyUsers([cur.user_id], {
    type: "reservation_declined",
    title: "予約をお受けできませんでした",
    body: "満席のためお受けできませんでした。仮決済は解放され、請求は発生しません。",
    url: "/mypage/reservations",
  }).catch(() => {});
  return { ok: true };
}

/** 来店後・時間経過後の処理。arrived=枠を解放し現地で全額決済 / applied=デポジットを会計に充当(売上確定) / no_show=無断キャンセル(没収=売上確定)。 */
export async function settleReservation(shopId: string, id: string, kind: "arrived" | "applied" | "no_show"): Promise<Result> {
  const cur = await loadForShop(shopId, id);
  if (!cur) return { ok: false, error: "予約が見つかりません" };
  if (cur.status !== "confirmed") return { ok: false, error: "確定済みの予約だけ処理できます" };
  if (new Date(cur.reserve_at).getTime() > Date.now()) return { ok: false, error: "予約の時刻になってから処理できます" };

  const nextStatus = kind === "no_show" ? "no_show" : "completed";
  const row = await transition(id, ["confirmed"], { status: nextStatus });
  if (!row) return { ok: false, error: "すでに処理済みです" };

  const provider = paymentProvider();
  const res = !cur.payment_ref
    ? ({ ok: true, ref: "" } as const)
    : kind === "arrived"
      ? await provider.release(cur.payment_ref)
      : await provider.capture(cur.payment_ref);
  if (!res.ok) {
    await revert(id, "confirmed");
    return { ok: false, error: `決済の処理に失敗しました: ${res.error}` };
  }
  await db()
    .from("locapass_reservations")
    .update({ payment_status: kind === "arrived" ? "released" : "captured", settled_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: true };
}

/** 客の取り消し。リクエスト中はいつでも(仮決済を解放)。確定後は来店のCUSTOMER_CANCEL_HOURS時間前まで。 */
export async function cancelByCustomer(userId: string, id: string): Promise<Result> {
  const { data: cur } = await db().from("locapass_reservations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!cur) return { ok: false, error: "予約が見つかりません" };
  const r = cur as ReservationRow;
  if (r.status !== "requested" && r.status !== "confirmed") return { ok: false, error: "この予約は取り消せません" };
  if (r.status === "confirmed" && new Date(r.reserve_at).getTime() - Date.now() < CUSTOMER_CANCEL_HOURS * HOUR) {
    return { ok: false, error: `来店の${CUSTOMER_CANCEL_HOURS}時間前を過ぎているため、お店へ直接ご連絡ください` };
  }
  const row = await transition(id, ["requested", "confirmed"], { status: "cancelled" });
  if (!row) return { ok: false, error: "この予約は取り消せません" };
  const rel = r.payment_ref ? await paymentProvider().release(r.payment_ref) : ({ ok: true, ref: "" } as const);
  if (!rel.ok) {
    await revert(id, r.status);
    return { ok: false, error: `仮決済の解放に失敗しました: ${rel.error}` };
  }
  await db().from("locapass_reservations").update({ payment_status: "released", settled_at: new Date().toISOString() }).eq("id", id);
  await notifyShopAdmins(r.shop_id, {
    type: "reservation_cancelled",
    title: "予約が取り消されました",
    body: `${fmtJst(r.reserve_at)} ${r.party_size}名 ${r.contact_name}様`,
    url: `/dashboard/shop/${r.shop_id}/reservations`,
  }).catch(() => {});
  return { ok: true };
}
