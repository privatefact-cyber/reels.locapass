import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { PolicyForm, RespondButtons, SettleButtons } from "@/components/reservation/ShopReservationActions";
import { PAYMENT_LABEL, STATUS_COLOR, STATUS_LABEL, formatJst } from "@/lib/reservation/labels";
import { sweepStale } from "@/lib/reservation/service";
import { reservationEnabled, shopCanTakeReservations, type ReservationRow } from "@/lib/reservation/config";

export const dynamic = "force-dynamic";

function Card({ r, children }: { r: ReservationRow; children?: React.ReactNode }) {
  return (
    <li className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-black">{formatJst(r.reserve_at)} / {r.party_size}名</p>
          <p className="text-sm font-semibold">{r.contact_name} 様</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      </div>
      <p className="text-xs text-slate-600">
        連絡先: <a href={`tel:${r.contact_phone}`} className="font-bold underline">{r.contact_phone}</a>(電話/SMS)
      </p>
      {r.note && <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs">ご要望: {r.note}</p>}
      <p className="text-[11px] text-slate-500">デポジット{r.deposit_amount.toLocaleString()}円({r.payment_method === "hold" ? "与信保持" : "カード保存"}): {PAYMENT_LABEL[r.payment_status]}{r.payment_provider === "stub" ? "(テスト)" : ""}</p>
      {children}
    </li>
  );
}

export default async function ShopReservationsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  // 放置された予約(返答なし・来店処理漏れ)を、この店舗の分だけ自動処理してから表示する。
  if (reservationEnabled()) await sweepStale({ shopId }).catch(() => {});
  const supabase = await createClient();
  const [{ data: shop }, { data }, { data: credits }] = await Promise.all([
    (supabase as any).from("locapass_shops").select("plan, reservation_free_cancel_hours").eq("id", shopId).maybeSingle(),
    (supabase as any).from("locapass_reservations").select("*").eq("shop_id", shopId).order("reserve_at", { ascending: true }).limit(200),
    (supabase as any).from("locapass_shop_credits").select("net_amount, gross_amount, fee_amount, status, created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(100),
  ]);
  const pendingCredit = ((credits ?? []) as { net_amount: number; status: string }[]).filter((c) => c.status === "pending").reduce((a, c) => a + c.net_amount, 0);
  const appliedCredit = ((credits ?? []) as { net_amount: number; status: string }[]).filter((c) => c.status === "applied").reduce((a, c) => a + c.net_amount, 0);
  const rows = (data ?? []) as ReservationRow[];
  const now = Date.now();
  const requested = rows.filter((r) => r.status === "requested");
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const review = rows.filter((r) => r.status === "cancel_review");
  const toSettle = confirmed.filter((r) => new Date(r.reserve_at).getTime() <= now);
  const upcoming = confirmed.filter((r) => new Date(r.reserve_at).getTime() > now);
  const history = rows.filter((r) => r.status !== "requested" && r.status !== "confirmed" && r.status !== "cancel_review").reverse().slice(0, 30);
  const available = reservationEnabled() && shopCanTakeReservations(shop?.plan);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">優先予約</h1>
        <p className="mt-1 text-sm text-slate-600">席だけ確保・お料理は現地で。お客様は1名500円(上限5,000円)のデポジットをカードで保証してリクエストします。ご来店なら請求は0円です。</p>
        {!available && (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            この店舗では、優先予約はまだ受け付けていません(有料掲載プランの店舗で、運営が公開したときに有効になります)。
          </p>
        )}
      </div>

      <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-slate-900">
        <p className="text-xs font-bold text-emerald-900">無断キャンセルのデポジット残高(月額利用料から控除)</p>
        <p className="mt-1 text-2xl font-black">{pendingCredit.toLocaleString()}円</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Stripe決済手数料(約3.6%)を差し引いた金額です(接続後に実額へ置き換わります)。振込は発生せず、翌月以降の月額利用料の請求から差し引きます。控除済みの累計: {appliedCredit.toLocaleString()}円
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
        <p className="text-sm font-bold">キャンセルの方針</p>
        <p className="mb-2 mt-0.5 text-[11px] text-slate-600">
          お客様が無料で取り消せる期限です。それ以降の取り消しは「判断待ち」としてここに届き、「請求なし」か「キャンセル料を請求」をワンタップで選べます。事前連絡があった場合も、同じボタンで選べます。
        </p>
        <PolicyForm shopId={shopId} hours={shop?.reservation_free_cancel_hours ?? 3} />
      </section>

      {review.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-orange-700">直前キャンセルの判断({review.length})</h2>
          <ul className="space-y-3">
            {review.map((r) => (
              <Card key={r.id} r={r}>
                <SettleButtons shopId={shopId} id={r.id} deposit={r.deposit_amount} started={false} review />
              </Card>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">返答待ち({requested.length})</h2>
        {requested.length === 0 ? <p className="text-sm text-slate-500">新しいリクエストはありません。</p> : (
          <ul className="space-y-3">{requested.map((r) => <Card key={r.id} r={r}><RespondButtons shopId={shopId} id={r.id} /></Card>)}</ul>
        )}
      </section>

      {toSettle.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-red-700">来店の確認({toSettle.length})</h2>
          <ul className="space-y-3">{toSettle.map((r) => <Card key={r.id} r={r}><SettleButtons shopId={shopId} id={r.id} deposit={r.deposit_amount} started review={false} /></Card>)}</ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">確定済み・これから({upcoming.length})</h2>
        {upcoming.length === 0 ? <p className="text-sm text-slate-500">ありません。</p> : (
          <ul className="space-y-3">{upcoming.map((r) => (
              <Card key={r.id} r={r}>
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer font-bold">お客様から連絡があった場合</summary>
                  <div className="mt-2"><SettleButtons shopId={shopId} id={r.id} deposit={r.deposit_amount} started={false} review={false} /></div>
                </details>
              </Card>
            ))}</ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">履歴</h2>
        {history.length === 0 ? <p className="text-sm text-slate-500">まだありません。</p> : (
          <ul className="space-y-3">{history.map((r) => <Card key={r.id} r={r} />)}</ul>
        )}
      </section>
    </div>
  );
}
