import Link from "next/link";
import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { CancelButton } from "@/components/reservation/CancelButton";
import { PAYMENT_LABEL, STATUS_COLOR, STATUS_LABEL, formatJst } from "@/lib/reservation/labels";
import { sweepStale } from "@/lib/reservation/service";
import { reservationEnabled } from "@/lib/reservation/config";
import type { ReservationRow } from "@/lib/reservation/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "予約履歴 | locapass", robots: { index: false } };

export default async function MyReservationsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const user = await requireCurrentUser();
  if (reservationEnabled()) await sweepStale({ userId: user.id }).catch(() => {});
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("locapass_reservations")
    .select("*, shop:locapass_shops ( name, tel, line_url, slug, reservation_free_cancel_hours, portal:locapass_portals ( slug ) )")
    .eq("user_id", user.id)
    .order("reserve_at", { ascending: false })
    .limit(50);
  type Row = ReservationRow & { shop: { name: string; reservation_free_cancel_hours: number; tel: string | null; line_url: string | null; slug: string; portal: { slug: string } | { slug: string }[] | null } | null };
  const rows = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6 text-main">
      <Link href="/mypage" className="text-xs text-tone-300 underline">← マイページ</Link>
      <h1 className="text-xl font-black">予約履歴</h1>
      {sent && (
        <p className="rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          予約をリクエストしました。お店の返答をお待ちください(通知でお知らせします)。
        </p>
      )}
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-tone-500">予約はまだありません。</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const portal = r.shop ? (Array.isArray(r.shop.portal) ? r.shop.portal[0] : r.shop.portal) : null;
            const open = r.status === "requested" || r.status === "confirmed";
            const freeHours = r.shop?.reservation_free_cancel_hours ?? 3;
            const late = r.status === "confirmed" && new Date(r.reserve_at).getTime() - Date.now() < freeHours * 3600_000;
            return (
              <li key={r.id} className="space-y-2 rounded-xl border border-main/10 bg-tone-900/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {portal && r.shop ? <Link href={`/${portal.slug}/shops/${r.shop.slug}`} className="underline-offset-2 hover:underline">{r.shop.name}</Link> : r.shop?.name}
                    </p>
                    <p className="text-sm text-tone-300">{formatJst(r.reserve_at)} / {r.party_size}名</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <p className="text-[11px] text-tone-500">デポジット{r.deposit_amount.toLocaleString()}円({r.payment_method === "hold" ? "カード枠を確保" : "カード保存"}): {PAYMENT_LABEL[r.payment_status]}{r.payment_provider === "stub" ? "(テスト)" : ""}</p>
                {r.status === "cancel_review" && <p className="rounded-lg bg-orange-500/15 px-2 py-1.5 text-xs text-orange-200">取り消しを受け付けました。キャンセル料({r.deposit_amount.toLocaleString()}円)が発生するかどうかは、お店が判断します。結果は通知でお知らせします。</p>}
                {r.shop_message && <p className="rounded-lg bg-main/5 px-2 py-1.5 text-xs text-tone-300">お店より: {r.shop_message}</p>}
                {open && (
                  <div className="flex flex-wrap items-center gap-2">
                    {r.shop?.tel && <a href={`tel:${r.shop.tel.replace(/[^0-9+]/g, "")}`} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black">お店に電話</a>}
                    {r.shop?.line_url && <a href={r.shop.line_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#06C755] px-3 py-1.5 text-xs font-bold text-white">LINEで連絡</a>}
                    <CancelButton id={r.id} late={late} freeHours={freeHours} deposit={r.deposit_amount} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
