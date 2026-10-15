"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { submitReservation } from "@/app/reserve/[shopId]/actions";
import { AUTO_DECLINE_HOURS, DEPOSIT_MAX, DEPOSIT_PER_PERSON, MAX_DAYS_AHEAD, depositFor, methodFor } from "@/lib/reservation/config";

const SLOTS = Array.from({ length: 29 }, (_, i) => {
  const m = 10 * 60 + i * 30; // 10:00〜24:00
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

function jstDate(offsetDays: number) {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export function ReserveForm({ shopId, shopName, defaultName, stub, freeCancelHours }: { shopId: string; shopName: string; defaultName: string; stub: boolean; freeCancelHours: number }) {
  const router = useRouter();
  const dates = useMemo(
    () =>
      Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, i) => {
        const iso = jstDate(i);
        const d = new Date(`${iso}T00:00:00+09:00`);
        return { iso, label: d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }) };
      }),
    [],
  );
  const [date, setDate] = useState(dates[0].iso);
  const [time, setTime] = useState("19:00");
  const [party, setParty] = useState(2);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const deposit = depositFor(party);
  const method = methodFor(new Date(`${date}T${time}:00+09:00`).getTime());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitReservation({
        shopId,
        partySize: party,
        reserveAt: `${date}T${time}:00+09:00`,
        contactName: name,
        contactPhone: phone,
        note: note || null,
      });
      if (!res.ok) return setError(res.error);
      router.push("/mypage/reservations?sent=1");
    });
  }

  const input = "mt-1 w-full rounded-lg border border-tone-700 bg-tone-800 px-3 py-2.5 text-base text-main placeholder:text-tone-500";
  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6 text-main">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-black">
          <CalendarCheck className="h-5 w-5 text-accent" /> 優先予約
        </h1>
        <p className="mt-1 text-sm text-tone-300">{shopName}</p>
      </header>

      {stub && (
        <p className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          テスト動作中: 決済は仮の動作で、実際の請求は発生しません。
        </p>
      )}

      <div className="rounded-xl border border-main/10 bg-tone-900/60 p-3 text-xs leading-relaxed text-tone-300">
        <p className="font-bold text-main">席だけ確保。お料理は当日お店でご注文ください。</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>デポジットは1名{DEPOSIT_PER_PERSON.toLocaleString()}円(上限{DEPOSIT_MAX.toLocaleString()}円)。ご来店されれば<b>請求は0円</b>です。</li>
          <li>
            {method === "hold"
              ? "ご予約時にカード枠を一時的に確保します(まだ請求されません)。ご来店・お取り消しで解放されます。"
              : "ご予約時にカード情報を保存します(枠の確保や請求はありません)。無断キャンセルのときだけ保存したカードに請求します。"}
          </li>
          <li>お店が「受ける」と予約確定。お受けできない場合や、お店から返答がない場合({AUTO_DECLINE_HOURS}時間)は、請求なしで解放されます。</li>
          <li>無断キャンセルの場合は、デポジットをキャンセル料として請求します。</li>
          <li>確定後のお取り消しは、来店の{freeCancelHours}時間前までは無料です。それ以降は、お店の判断でキャンセル料(上記デポジット)が発生する場合があります。事前にご連絡いただければ、お店が配慮することもあります。</li>
          <li>プリペイドカードはご利用いただけません。</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-bold">
          日付
          <select value={date} onChange={(e) => setDate(e.target.value)} className={input}>
            {dates.map((d) => (
              <option key={d.iso} value={d.iso}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          時間
          <select value={time} onChange={(e) => setTime(e.target.value)} className={input}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-bold">
        人数
        <select value={party} onChange={(e) => setParty(Number(e.target.value))} className={input}>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}名</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-bold">
        お名前
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={input} />
      </label>
      <label className="block text-sm font-bold">
        連絡先電話番号(お店からの連絡用)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="09012345678" className={input} />
      </label>
      <label className="block text-sm font-bold">
        ご要望(任意)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className={input} />
      </label>

      <label className="flex items-start gap-2 text-xs text-tone-300">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4" />
        上記の内容(デポジットの扱い・無断キャンセル時のキャンセル料の請求)に同意します。
      </label>

      {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || !agree || !name.trim() || !phone.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-black text-black disabled:opacity-50 active:scale-95"
      >
        {pending ? "送信中..." : `デポジット${deposit.toLocaleString()}円で予約をリクエスト`}
      </button>
    </form>
  );
}
