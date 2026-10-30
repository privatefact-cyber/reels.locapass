"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, Copy, Trash2, Square, ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import { SpotMapPicker, type Spot } from "@/components/locapass-dashboard/SpotMapPicker";
import { createSpot, createSpots, deleteSpot, endSpotNow } from "@/app/dashboard/shop/[shopId]/today/actions";
import { reverseGeocode } from "@/lib/map/geocode";

export type SpotRow = { id: string; startsAt: string; endsAt: string; address: string | null; lat: number; lng: number; note: string | null };

const DURATIONS = [1, 2, 3, 4, 6, 8];

function fmtDate(d: Date) {
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}
/** ISO文字列 → JSTの日付キー(YYYY-MM-DD)。 */
function jstKey(iso: string | number): string {
  return new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}
/** datetime-local 用(ブラウザのローカル時刻)。 */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * variant: "mobile"=移動販売(営業を始める) / "event"=オプションで開いた店(譲渡会・イベントなどの開催場所のお知らせ。
 * 「いま営業を始める(現在地)」は無く、予定の登録だけ)。
 */
export function TodaySpotManager({ shopId, active, upcoming, past, variant = "mobile" }: { shopId: string; active: SpotRow[]; upcoming: SpotRow[]; past: SpotRow[]; variant?: "mobile" | "event" }) {
  const ev = variant === "event";
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
  // 予定カレンダー(登録済みの予定を月表示で見る・日を選んで、その日の予定の確認・削除・コピー、予定の追加)
  const todayKey = jstKey(Date.now());
  const allSpots = [...active, ...upcoming, ...past];
  const [calMonth, setCalMonth] = useState(todayKey.slice(0, 7));
  const [calDay, setCalDay] = useState<string>(todayKey);

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
    if (!spot) return setMsg({ ok: false, text: ev ? "地図で開催場所を選んでください" : "地図で出店場所を選んでください" });
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

  /** カレンダーで選んだ日を、登録フォームの日付にする(開始・終了の時刻と長さはそのまま)。 */
  function pickDateForForm(dayKey: string) {
    const s0 = new Date(startAt);
    const e0 = new Date(endAt);
    const [y, m, d] = dayKey.split("-").map(Number);
    const ns = new Date(y, m - 1, d, s0.getHours(), s0.getMinutes(), 0, 0);
    const len = e0.getTime() - s0.getTime();
    setStartAt(toLocalInput(ns));
    setEndAt(toLocalInput(new Date(ns.getTime() + (len > 0 ? len : 3 * 3600 * 1000))));
    setMsg({ ok: true, text: `登録フォームの日付を ${m}/${d} にしました。場所を選んで「予定を登録」を押してください。` });
    document.getElementById("spot-form")?.scrollIntoView({ behavior: "smooth" });
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

  // カレンダーの計算(月の日マス、日ごとの予定)
  const byDay = new Map<string, SpotRow[]>();
  for (const sp of [...allSpots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = jstKey(sp.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), sp]);
  }
  const [calY, calM] = calMonth.split("-").map(Number);
  const calFirstWeekday = new Date(Date.UTC(calY, calM - 1, 1)).getUTCDay();
  const calDays = new Date(Date.UTC(calY, calM, 0)).getUTCDate();
  const calCells: (string | null)[] = [...Array(calFirstWeekday).fill(null), ...Array.from({ length: calDays }, (_, i) => `${calMonth}-${String(i + 1).padStart(2, "0")}`)];
  function shiftCalMonth(d: number) {
    const next = new Date(Date.UTC(calY, calM - 1 + d, 1));
    setCalMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3";

  return (
    <div className="space-y-5">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}

      {/* いま営業中 */}
      {active.length > 0 && (
        <section className="space-y-2 rounded-xl border-2 border-orange-400 bg-orange-50 p-4">
          <h2 className="flex items-center gap-1.5 font-bold text-orange-900">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500" /> {ev ? "いま開催中" : "いま営業中"}
          </h2>
          {active.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-1 font-semibold text-slate-900"><MapPin size={14} className="text-orange-500" /> {r.address || "(住所なし)"}</p>
                <p className="text-xs text-slate-500">{fmt(r.startsAt)} 〜 {fmt(r.endsAt)}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => run(() => endSpotNow(shopId, r.id), ev ? "開催を終了しました。地図から消えます。" : "営業を終了しました。地図から消えます。")} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                <Square size={12} /> {ev ? "開催終了" : "営業終了"}
              </button>
            </div>
          ))}
        </section>
      )}

      {/* 営業開始ボタン(移動販売だけ) */}
      {!ev && (
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
      )}

      {/* 予定登録 */}
      <section id="spot-form" className={card}>
        <h2 className="font-bold text-slate-900">{ev ? "開催予定を登録する" : "出店予定を登録する"}</h2>
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

      {/* 予定カレンダー(これからの予定も、過去の出店も、ここで見る) */}
      <section className={card}>
        <h2 className="font-bold text-slate-900">予定カレンダー</h2>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="前の月" onClick={() => shiftCalMonth(-1)} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <p className="text-sm font-bold text-slate-900">{calMonth.split("-")[0]}年{Number(calMonth.split("-")[1])}月</p>
          <button type="button" aria-label="次の月" onClick={() => shiftCalMonth(1)} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-slate-500">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : ""}>{w}</span>
          ))}
          {calCells.map((k, i) => {
            if (!k) return <span key={`b${i}`} />;
            const evs = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            const isSel = k === calDay;
            const nowMs = Date.now();
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCalDay(k)}
                aria-label={`${Number(k.slice(5, 7))}月${Number(k.slice(8))}日${evs.length ? `(予定${evs.length}件)` : ""}`}
                className={`relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm transition ${isSel ? "bg-slate-900 font-bold text-white" : "text-slate-800 hover:bg-slate-100"} ${isToday && !isSel ? "ring-1 ring-orange-400" : ""}`}
              >
                {Number(k.slice(8))}
                {evs.length > 0 && (
                  <span className="absolute bottom-0.5 flex gap-0.5">
                    {evs.slice(0, 3).map((e) => {
                      const live = Date.parse(e.startsAt) <= nowMs && Date.parse(e.endsAt) >= nowMs;
                      const ended = Date.parse(e.endsAt) < nowMs;
                      return <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-orange-500" : ended ? (isSel ? "bg-slate-400" : "bg-slate-300") : isSel ? "bg-sky-300" : "bg-sky-600"}`} />;
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-x-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-600" />予定</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />{ev ? "開催中" : "営業中"}</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />終了</span>
        </p>

        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">
              {Number(calDay.slice(5, 7))}月{Number(calDay.slice(8))}日({WEEKDAYS[new Date(`${calDay}T00:00:00Z`).getUTCDay()]})
              <span className="ml-2 text-xs font-normal text-slate-500">{(byDay.get(calDay) ?? []).length}件</span>
            </p>
            <button type="button" onClick={() => pickDateForForm(calDay)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <CalendarPlus size={13} /> この日に予定を追加
            </button>
          </div>
          {(byDay.get(calDay) ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">この日の予定はありません</p>
          ) : (
            (byDay.get(calDay) ?? []).map((r) => (
              <Row key={r.id} r={r} pending={pending} onCopy={() => copyToForm(r)} onDelete={() => run(() => deleteSpot(shopId, r.id), "予定を削除しました")} />
            ))
          )}
        </div>
      </section>
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
