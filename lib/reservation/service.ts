import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUTO_DECLINE_HOURS,
  AUTO_RELEASE_HOURS,
  DEFAULT_FREE_CANCEL_HOURS,
  FEE_RATE,
  MAX_DAYS_AHEAD,
  MAX_OPEN_PER_USER,
  MIN_LEAD_HOURS,
  NEWBIE_MAX_OPEN,
  NEWBIE_MAX_PARTY,
  depositFor,
  methodFor,
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

  // 過去の予約を見て、受付の可否を決める(請求に失敗したことのある人は止める/初めての人は上限を低くする)。
  const { data: mine } = await admin.from("locapass_reservations").select("status, payment_status, reserve_at").eq("user_id", userId).limit(200);
  const history = (mine ?? []) as Pick<ReservationRow, "status" | "payment_status" | "reserve_at">[];
  if (history.some((h) => h.payment_status === "failed")) {
    return { ok: false, error: "過去のデポジットのお支払いが完了していないため、現在ご予約いただけません。お問い合わせください" };
  }
  const open = history.filter((h) => (h.status === "requested" || h.status === "confirmed") && new Date(h.reserve_at).getTime() > now).length;
  if (open >= MAX_OPEN_PER_USER) return { ok: false, error: `同時にお申し込みできるのは${MAX_OPEN_PER_USER}件までです` };
  const newbie = !history.some((h) => h.status === "completed");
  if (newbie && input.partySize > NEWBIE_MAX_PARTY) return { ok: false, error: `はじめてのご予約は${NEWBIE_MAX_PARTY}名までです。ご来店の実績ができると、それ以上もご予約いただけます` };
  if (newbie && open >= NEWBIE_MAX_OPEN) return { ok: false, error: "はじめてのご予約は、同時に1件までです" };

  const id = crypto.randomUUID();
  const provider = paymentProvider();
  const method = methodFor(at);
  const deposit = depositFor(input.partySize);
  // 与信の確保(またはカード保存)に成功してから予約を作る。失敗したら予約は作らない。
  const pay = await provider.secure({ reservationKey: id, amount: deposit, method });
  if (!pay.ok) return { ok: false, error: `カードの確認に失敗しました: ${pay.error}` };
  if (pay.fingerprint) {
    // 過去に没収・請求失敗のあったカードは受け付けない。
    const { count: bad } = await admin
      .from("locapass_reservations")
      .select("id", { count: "exact", head: true })
      .eq("card_fingerprint", pay.fingerprint)
      .or("status.eq.no_show,payment_status.eq.failed");
    if ((bad ?? 0) > 0) {
      await provider.release(pay.ref, method).catch(() => {});
      return { ok: false, error: "このカードではご予約いただけません。別のカードをお試しください" };
    }
  }

  const { error } = await admin.from("locapass_reservations").insert({
    id,
    shop_id: shop.id,
    user_id: userId,
    party_size: input.partySize,
    reserve_at: new Date(at).toISOString(),
    note,
    contact_name: name,
    contact_phone: phone,
    deposit_amount: deposit,
    payment_provider: provider.name,
    payment_method: method,
    payment_status: "authorized",
    payment_ref: pay.ref,
    card_fingerprint: pay.fingerprint ?? null,
  });
  if (error) {
    await provider.release(pay.ref, method).catch(() => {});
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
  const rel = cur.payment_ref ? await paymentProvider().release(cur.payment_ref, cur.payment_method) : ({ ok: true, ref: "" } as const);
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

/**
 * お店のワンタップ判断。
 *  arrived = 来店。枠(保存カード)を解放し請求0円(予約時刻以降)。
 *  no_show = 連絡なしの無断キャンセル。デポジットを請求(予約時刻以降)。
 *  waive   = 事前連絡あり/直前キャンセルを「請求なし」で許す(神対応)。いつでも。枠を解放。
 *  charge  = 事前連絡あり/直前キャンセルでも「キャンセル料を請求」する。いつでも。
 * 請求(no_show/charge)に失敗しても(残高不足・認証要求・解約など)結果の状態は残し、payment_status='failed' にする
 * (そのお客様は以後ご予約不可)。成功時だけ、お店の台帳(月額利用料から控除)に積む。
 */
export type SettleKind = "arrived" | "no_show" | "waive" | "charge";
export async function settleReservation(shopId: string, id: string, kind: SettleKind): Promise<Result<{ warning?: string }>> {
  const cur = await loadForShop(shopId, id);
  if (!cur) return { ok: false, error: "予約が見つかりません" };
  const timed = kind === "arrived" || kind === "no_show";
  const allowed = timed ? ["confirmed"] : ["confirmed", "cancel_review"];
  if (!allowed.includes(cur.status)) return { ok: false, error: "この予約は、すでに処理済みか、まだ処理できない状態です" };
  if (timed && new Date(cur.reserve_at).getTime() > Date.now()) return { ok: false, error: "予約の時刻になってから処理できます" };

  const next = { arrived: "completed", no_show: "no_show", waive: "cancelled", charge: "late_cancelled" }[kind];
  const row = await transition(id, allowed, { status: next, responded_at: cur.responded_at ?? new Date().toISOString() });
  if (!row) return { ok: false, error: "すでに処理済みです" };
  const provider = paymentProvider();
  const now = new Date().toISOString();

  if (kind === "arrived" || kind === "waive") {
    const rel = cur.payment_ref ? await provider.release(cur.payment_ref, cur.payment_method) : ({ ok: true, ref: "" } as const);
    if (!rel.ok) {
      await revert(id, cur.status);
      return { ok: false, error: `解放に失敗しました: ${rel.error}` };
    }
    await db().from("locapass_reservations").update({ payment_status: "released", settled_at: now }).eq("id", id);
    if (kind === "waive") {
      await notifyUsers([cur.user_id], {
        type: "reservation_cancelled",
        title: "キャンセルを承りました",
        body: `${fmtJst(cur.reserve_at)} のご予約はキャンセル料なしで承りました。請求は発生しません。`,
        url: "/mypage/reservations",
      }).catch(() => {});
    }
    return { ok: true };
  }

  const cap = cur.payment_ref ? await provider.capture(cur.payment_ref, cur.payment_method, cur.deposit_amount) : ({ ok: false, error: "決済情報がありません" } as const);
  if (!cap.ok) {
    await db().from("locapass_reservations").update({ payment_status: "failed", settled_at: now }).eq("id", id);
    return { ok: true, warning: `デポジットを回収できませんでした(${cap.error})。このお客様は以後ご予約いただけません。` };
  }
  const gross = cur.deposit_amount;
  const fee = Math.round(gross * FEE_RATE);
  await db().from("locapass_reservations").update({ payment_status: "captured", settled_at: now }).eq("id", id);
  await db().from("locapass_shop_credits").insert({ shop_id: shopId, reservation_id: id, gross_amount: gross, fee_amount: fee, net_amount: gross - fee });
  if (kind === "charge") {
    await notifyUsers([cur.user_id], {
      type: "reservation_cancelled",
      title: "キャンセル料のご請求",
      body: `${fmtJst(cur.reserve_at)} のご予約について、キャンセル料${gross.toLocaleString()}円を請求しました。`,
      url: "/mypage/reservations",
    }).catch(() => {});
  }
  return { ok: true };
}

/**
 * 放置された予約の自動処理(自動で没収はしない)。cronのエンドポイントと、お店/お客様の画面を開いたときに呼ぶ。
 *  - 返答待ちのまま AUTO_DECLINE_HOURS 経過、または来店30分前を過ぎたリクエスト → 辞退して解放(お客様へ通知)
 *  - 確定のまま来店から AUTO_RELEASE_HOURS 経過 → 来店扱いで解放(お店が処理を忘れた場合)
 */
export async function sweepStale(scope: { shopId?: string; userId?: string } = {}): Promise<{ declined: number; released: number }> {
  const admin = db();
  const nowMs = Date.now();
  const provider = paymentProvider();
  const out = { declined: 0, released: 0 };
  const apply = (q: any) => {
    if (scope.shopId) q = q.eq("shop_id", scope.shopId);
    if (scope.userId) q = q.eq("user_id", scope.userId);
    return q;
  };

  const { data: reqs } = await apply(admin.from("locapass_reservations").select("*").eq("status", "requested")).limit(200);
  for (const r of (reqs ?? []) as ReservationRow[]) {
    const stale = nowMs - new Date(r.created_at).getTime() > AUTO_DECLINE_HOURS * 3600_000 || new Date(r.reserve_at).getTime() - nowMs < 30 * 60_000;
    if (!stale) continue;
    const row = await transition(r.id, ["requested"], { status: "declined", shop_message: "(お店から返答がなかったため自動でお断りしました)", responded_at: new Date().toISOString() });
    if (!row) continue;
    const rel = r.payment_ref ? await provider.release(r.payment_ref, r.payment_method) : ({ ok: true, ref: "" } as const);
    if (!rel.ok) {
      await revert(r.id, "requested");
      continue;
    }
    await admin.from("locapass_reservations").update({ payment_status: "released", settled_at: new Date().toISOString() }).eq("id", r.id);
    await notifyUsers([r.user_id], {
      type: "reservation_declined",
      title: "予約をお受けできませんでした",
      body: "お店から返答がなかったため、自動でお断りしました。仮決済(カード保存)は解放され、請求は発生しません。",
      url: "/mypage/reservations",
    }).catch(() => {});
    out.declined++;
  }

  const cutoff = new Date(nowMs - AUTO_RELEASE_HOURS * 3600_000).toISOString();
  const { data: conf } = await apply(admin.from("locapass_reservations").select("*").in("status", ["confirmed", "cancel_review"]).lt("reserve_at", cutoff)).limit(200);
  for (const r of (conf ?? []) as ReservationRow[]) {
    const wasReview = r.status === "cancel_review";
    const row = await transition(r.id, [r.status], {
      status: wasReview ? "cancelled" : "completed",
      shop_message: wasReview ? "(お店の判断がなかったため、キャンセル料なしで自動解放しました)" : "(来店の処理がなかったため自動で解放しました)",
    });
    if (!row) continue;
    const rel = r.payment_ref ? await provider.release(r.payment_ref, r.payment_method) : ({ ok: true, ref: "" } as const);
    if (!rel.ok) {
      await revert(r.id, r.status);
      continue;
    }
    await admin.from("locapass_reservations").update({ payment_status: "released", settled_at: new Date().toISOString() }).eq("id", r.id);
    out.released++;
  }
  return out;
}

/**
 * 客の取り消し。
 *  - リクエスト中: いつでも。仮決済(保存カード)を解放。
 *  - 確定後: お店の設定(無料で取り消せる期限=来店のN時間前まで)より前なら、無料(解放)。
 *    期限を過ぎていたら「お店の判断待ち(cancel_review)」にして、カードは保持したままお店へ通知する
 *    (請求するか・無料にするかは、お店がワンタップで決める)。
 */
export async function cancelByCustomer(userId: string, id: string): Promise<Result<{ review?: boolean }>> {
  const { data: cur } = await db().from("locapass_reservations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!cur) return { ok: false, error: "予約が見つかりません" };
  const r = cur as ReservationRow;
  if (r.status !== "requested" && r.status !== "confirmed") return { ok: false, error: "この予約は取り消せません" };

  const { data: shop } = await db().from("locapass_shops").select("reservation_free_cancel_hours").eq("id", r.shop_id).maybeSingle();
  const freeHours: number = shop?.reservation_free_cancel_hours ?? DEFAULT_FREE_CANCEL_HOURS;
  const late = r.status === "confirmed" && new Date(r.reserve_at).getTime() - Date.now() < freeHours * HOUR;

  if (late) {
    const row = await transition(id, ["confirmed"], { status: "cancel_review" });
    if (!row) return { ok: false, error: "この予約は取り消せません" };
    await notifyShopAdmins(r.shop_id, {
      type: "reservation_cancelled",
      title: "直前のキャンセル(ご判断ください)",
      body: `${fmtJst(r.reserve_at)} ${r.party_size}名 ${r.contact_name}様。請求なし/キャンセル料を請求のどちらかを選んでください。`,
      url: `/dashboard/shop/${r.shop_id}/reservations`,
    }).catch(() => {});
    return { ok: true, review: true };
  }

  const row = await transition(id, ["requested", "confirmed"], { status: "cancelled" });
  if (!row) return { ok: false, error: "この予約は取り消せません" };
  const rel = r.payment_ref ? await paymentProvider().release(r.payment_ref, r.payment_method) : ({ ok: true, ref: "" } as const);
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
