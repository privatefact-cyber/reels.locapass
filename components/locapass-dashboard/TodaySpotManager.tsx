"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, Copy, Trash2, Square } from "lucide-react";
import { SpotMapPicker, type Spot } from "@/components/locapass-dashboard/SpotMapPicker";
import { createSpot, createSpots, deleteSpot, endSpotNow } from "@/app/dashboard/shop/[shopId]/today/actions";
import { reverseGeocode } from "@/lib/map/geocode";

export type SpotRow = { id: string; startsAt: string; endsAt: string; address: string | null; lat: number; lng: number; note: string | null };

const DURATIONS = [1, 2, 3, 4, 6, 8];

function fmtDate(d: Date) {
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}
function fmt(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}
/** datetime-local 用(ブラウザのローカル時刻)。 */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TodaySpotManager({ shopId, active, upcoming, past }: { shopId: string; active: SpotRow[]; upcoming: SpotRow[]; past: SpotRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // いま営業を始める
  const [hours, setHours] = useState(3);
  // 前もっての予定
  const [spot, setSpot] = useState<Spot | null>(null);
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 4 * 60 * 60 * 1000)));
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [repeatCount, setRepeatCount] = useState(4);

  function run(fn: () => Promise<void>, okText: string) {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg({ ok: true, text: okText });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "失敗しました" });
      }
    });
  }

  function openHere() {
    setMsg(null);
    if (!navigator.geolocation) {
      setMsg({ ok: false, text: "この端末では現在地を取得できません。下の「予定を登録」で場所を選んでください。" });
      return;
    }
    setMsg({ ok: true, text: "現在地を取得しています…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        run(async () => {
          const address = (await reverseGeocode(lat, lng)) ?? "";
          await createSpot(shopId, { openNow: true, lat, lng, address, endsAt: new Date(Date.now() + hours * 3600 * 1000).toISOString() });
        }, `営業を開始しました(${hours}時間後に自動で終了)。地図にこの場所が出ます。`);
      },
      () => setMsg({ ok: false, text: "現在地を取得できませんでした。位置情報の許可を確認するか、下の「予定を登録」で場所を選んでください。" }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  /** 繰り返しを含めた、これから登録する(開始, 終了)の一覧。 */
  function occurrences(): { s: Date; e: Date }[] {
    const s0 = new Date(startAt);
    const e0 = new Date(endAt);
    if (Number.isNaN(s0.getTime()) || Number.isNaN(e0.getTime())) return [];
    const stepDays = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 0;
    const n = repeat === "none" ? 1 : repeatCount;
    return Array.from({ length: n }, (_, k) => {
      const s = new Date(s0);
      const e = new Date(e0);
      s.setDate(s.getDate() + stepDays * k);
      e.setDate(e.getDate() + stepDays * k);
      return { s, e };
    });
  }

  function register() {
    if (!spot) return setMsg({ ok: false, text: "地図で出店場所を選んでください" });
    const list = occurrences();
    if (list.length === 0) return setMsg({ ok: false, text: "日時を入れてください" });
    run(async () => {
      await createSpots(
        shopId,
        list.map(({ s, e }) => ({
          openNow: false,
          lat: spot.lat,
          lng: spot.lng,
          address: spot.address,
          startsAt: s.toISOString(),
          endsAt: e.toISOString(),
          note,
        })),
      );
      setNote("");
    }, list.length > 1 ? `${list.length}日ぶんの予定を登録しました。` : "予定を登録しました。開始時刻になると地図に出ます。");
  }

  function copyToForm(r: SpotRow) {
    setSpot({ lat: r.lat, lng: r.lng, address: r.address ?? "" });
    const s = new Date(r.startsAt);
    const e = new Date(r.endsAt);
    const d = new Date();
    // 同じ時間帯・同じ場所で「次の開催日」にする: 今日(過ぎていれば明日)の同じ時刻から。
    const shift = (t: Date) => {
      const n = new Date(d);
      n.setHours(t.getHours(), t.getMinutes(), 0, 0);
      return n;
    };
    let ns = shift(s);
    if (ns.getTime() < Date.now()) ns = new Date(ns.getTime() + 24 * 3600 * 1000);
    setStartAt(toLocalInput(ns));
    setEndAt(toLocalInput(new Date(ns.getTime() + (e.getTime() - s.getTime()))));
    setNote(r.note ?? "");
    setMsg({ ok: true, text: "前回の場所と時間帯をフォームに入れました。日時を確認して「予定を登録」を押してください。" });
    document.getElementById("spot-form")?.scrollIntoView({ behavior: "smooth" });
  }

  const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3";

  return (
    <div className="space-y-5">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}

      {/* いま営業中 */}
      {active.length > 0 && (
        <section className="space-y-2 rounded-xl border-2 border-orange-400 bg-orange-50 p-4">
          <h2 className="flex items-center gap-1.5 font-bold text-orange-900">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500" /> いま営業中
          </h2>
          {active.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1 font-semibold text-slate-900"><MapPin size={14} className="text-orange-500" /> {r.address || "(住所なし)"}</p>
                <p className="text-xs text-slate-500">{fmt(r.startsAt)} 〜 {fmt(r.endsAt)}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => run(() => endSpotNow(shopId, r.id), "営業を終了しました。地図から消えます。")} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                <Square size={12} /> 営業終了
              </button>
            </div>
          ))}
        </section>
      )}

      {/* 営業開始ボタン */}
      <section className={card}>
        <h2 className="font-bold text-slate-900">いま、ここで営業を始める</h2>
        <p className="text-xs leading-relaxed text-slate-500">いまの現在地を出店場所にして、すぐ地図に出します。お気に入りにしている人には通知が届きます。</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">営業時間</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900">
            {DURATIONS.map((h) => <option key={h} value={h}>{h}時間</option>)}
          </select>
          <span className="text-xs text-slate-500">経過すると自動で終了</span>
        </div>
        <button type="button" disabled={pending} onClick={openHere} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-4 text-base font-extrabold text-black shadow disabled:opacity-60">
          <Navigation size={18} /> 営業開始(現在地)
        </button>
      </section>

      {/* 予定登録 */}
      <section id="spot-form" className={card}>
        <h2 className="font-bold text-slate-900">出店予定を登録する</h2>
        <p className="text-xs text-slate-500">日付は先まで自由に選べます(180日先まで)。開始時刻から終了時刻までの間だけ地図に出ます。毎週・毎日の繰り返しもまとめて登録できます。</p>
        <SpotMapPicker value={spot} onChange={setSpot} />
        <label className="block text-sm text-slate-600">
          場所の表示(住所。直せます)
          <input value={spot?.address ?? ""} onChange={(e) => setSpot((s) => (s ? { ...s, address: e.target.value } : s))} placeholder="地図で場所を選ぶと入ります" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm text-slate-600">開始<input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
          <label className="block text-sm text-slate-600">終了<input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        </div>
        <label className="block text-sm text-slate-600">ひとこと(任意)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="例:限定メニューあり、雨天中止" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <span>繰り返し</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as "none" | "daily" | "weekly")} className="rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900">
            <option value="none">しない(この日だけ)</option>
            <option value="weekly">毎週(同じ曜日・同じ時間)</option>
            <option value="daily">毎日(同じ時間)</option>
          </select>
          {repeat !== "none" && (
            <>
              <select value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900">
                {(repeat === "weekly" ? [2, 3, 4, 6, 8, 12, 16, 24] : [2, 3, 5, 7, 10, 14, 21, 30]).map((n) => (
                  <option key={n} value={n}>{n}{repeat === "weekly" ? "週ぶん" : "日ぶん"}</option>
                ))}
              </select>
              <span className="w-full text-xs text-slate-500">
                {occurrences().length > 0 && `${fmtDate(occurrences()[0].s)} から ${fmtDate(occurrences()[occurrences().length - 1].s)} まで、${occurrences().length}件を登録します`}
              </span>
            </>
          )}
        </div>
        <button type="button" disabled={pending} onClick={register} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {repeat === "none" ? "予定を登録" : `${occurrences().length}件の予定をまとめて登録`}
        </button>
      </section>

      {/* これからの予定 */}
      {upcoming.length > 0 && (
        <section className={card}>
          <h2 className="font-bold text-slate-900">これからの予定({upcoming.length}件)</h2>
          {upcoming.map((r) => (
            <Row key={r.id} r={r} pending={pending} onCopy={() => copyToForm(r)} onDelete={() => run(() => deleteSpot(shopId, r.id), "予定を削除しました")} />
          ))}
        </section>
      )}

      {/* 過去(コピー用) */}
      {past.length > 0 && (
        <section className={card}>
          <h2 className="font-bold text-slate-900">過去の出店(コピーして次回の予定にできます)</h2>
          {past.map((r) => (
            <Row key={r.id} r={r} pending={pending} onCopy={() => copyToForm(r)} onDelete={() => run(() => deleteSpot(shopId, r.id), "履歴を削除しました")} />
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ r, pending, onCopy, onDelete }: { r: SpotRow; pending: boolean; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{r.address || "(住所なし)"}</p>
        <p className="text-xs text-slate-500">{fmt(r.startsAt)} 〜 {fmt(r.endsAt)}</p>
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={onCopy} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"><Copy size={12} /> コピー</button>
        <button type="button" disabled={pending} onClick={onDelete} className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 disabled:opacity-60"><Trash2 size={12} /> 削除</button>
      </div>
    </div>
  );
}
