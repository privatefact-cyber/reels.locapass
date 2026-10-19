"use client";

import { useState } from "react";
import { DAY_KEYS, LAST_CLOSE, emptyWeek, type DayKey, type WeeklyHours } from "@/lib/shop/businessHours";

const DAY_LABEL: Record<DayKey, string> = { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
const INPUT =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100 disabled:text-slate-400";

function defaultWeek(): WeeklyHours {
  const w = emptyWeek();
  for (const k of DAY_KEYS) w[k] = { closed: false, ranges: [{ open: "10:00", close: "19:00" }] };
  return w;
}

/**
 * 曜日ごとの営業時間カレンダー。保存はhiddenの business_hours_weekly(JSON)で送る。
 * 未設定(未記入)のときは空文字を送り、その店舗はNOWタブに出ない。
 */
export function BusinessHoursEditor({ initial, nowNote = true }: { initial: WeeklyHours | null; nowNote?: boolean }) {
  const [week, setWeek] = useState<WeeklyHours | null>(initial);

  const update = (key: DayKey, patch: Partial<WeeklyHours[DayKey]>) =>
    setWeek((w) => (w ? { ...w, [key]: { ...w[key], ...patch } } : w));

  if (!week) {
    return (
      <div>
        <input type="hidden" name="business_hours_weekly" value="" />
        <p className="text-xs text-slate-500">
          {nowNote
            ? "未記入です。曜日ごとの営業時間を設定すると、営業中だけトップの「NOW」に表示されます。"
            : "未記入です。曜日ごとの営業時間を設定すると、店舗ページに曜日別で表示されます。"}
        </p>
        <button type="button" onClick={() => setWeek(defaultWeek())} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          カレンダーで設定する
        </button>
      </div>
    );
  }

  return (
    <div>
      <input type="hidden" name="business_hours_weekly" value={JSON.stringify(week)} />
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {DAY_KEYS.map((key) => {
          const d = week[key];
          return (
            <div key={key} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5">
              <div className="w-8 pt-1.5 text-sm font-bold text-slate-800">{DAY_LABEL[key]}</div>
              <label className="flex items-center gap-1.5 pt-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={d.closed}
                  onChange={(e) =>
                    update(key, e.target.checked ? { closed: true } : { closed: false, ranges: d.ranges.length ? d.ranges : [{ open: "10:00", close: "19:00" }] })
                  }
                />
                定休日
              </label>
              {!d.closed && (
                <div className="min-w-0 flex-1 space-y-1.5">
                  {d.ranges.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input type="time" value={r.open} onChange={(e) => update(key, { ranges: d.ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)) })} className={INPUT} />
                      <span className="text-slate-400">〜</span>
                      <input
                        type="time"
                        value={r.last ? LAST_CLOSE : r.close}
                        disabled={r.last}
                        onChange={(e) => update(key, { ranges: d.ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)) })}
                        className={INPUT}
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!r.last}
                          onChange={(e) => update(key, { ranges: d.ranges.map((x, j) => (j === i ? { ...x, last: e.target.checked, close: e.target.checked ? LAST_CLOSE : x.close } : x)) })}
                        />
                        ラスト(深夜3時まで)
                      </label>
                      {d.ranges.length > 1 && (
                        <button type="button" onClick={() => update(key, { ranges: d.ranges.filter((_, j) => j !== i) })} className="text-xs text-rose-600">
                          削除
                        </button>
                      )}
                    </div>
                  ))}
                  {d.ranges.length < 4 && (
                    <button type="button" onClick={() => update(key, { ranges: [...d.ranges, { open: "17:00", close: "21:00" }] })} className="text-xs font-semibold text-slate-600 underline">
                      + 時間帯を追加(昼夜で分かれる場合など)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          onClick={() => setWeek((w) => (w ? (Object.fromEntries(DAY_KEYS.map((k) => [k, JSON.parse(JSON.stringify(w.mon))])) as WeeklyHours) : w))}
          className="font-semibold text-slate-600 underline"
        >
          月曜の内容を全曜日にコピー
        </button>
        <button type="button" onClick={() => setWeek(null)} className="text-slate-500 underline">
          未記入に戻す(NOWに表示されなくなります)
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">終了が開始より早い場合は翌日までの営業として扱います(例: 18:00〜03:00)。祝日の個別設定はありません。</p>
    </div>
  );
}
