"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** "YYYY-MM-DD"(日本時間の日付)。 */
export type DayKey = string;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toDayKey(ms: number): DayKey {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function keyOf(y: number, m: number, d: number): DayKey {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/**
 * イベント検索用のカレンダー。1日タップでその日、続けて別の日をタップで期間として選ぶ。
 * eventDays に含まれる日には、イベントがある印の点を付ける。
 */
export function EventDateCalendar({
  from,
  to,
  eventDays,
  locale,
  onChange,
}: {
  from: DayKey | null;
  to: DayKey | null;
  eventDays: Set<DayKey>;
  locale: string;
  onChange: (from: DayKey | null, to: DayKey | null) => void;
}) {
  const todayKey = toDayKey(Date.now());
  const [cursor, setCursor] = useState(() => {
    const base = from ?? todayKey;
    return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 };
  });

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    // 2023-01-01 は日曜
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))));
  }, [locale]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.y, cursor.m, 1))),
    [locale, cursor],
  );

  const firstWeekday = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  }

  function pick(day: DayKey) {
    if (!from || (from && to)) onChange(day, null);
    else if (day < from) onChange(day, null);
    else if (day === from) onChange(day, day);
    else onChange(from, day);
  }

  const rangeEnd = to ?? from;

  return (
    <div className="mt-4 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="prev"
          className="flex h-8 w-8 items-center justify-center rounded-full text-tone-300 hover:bg-main/10 hover:text-main"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-main">{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="next"
          className="flex h-8 w-8 items-center justify-center rounded-full text-tone-300 hover:bg-main/10 hover:text-main"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-tone-500">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const key = keyOf(cursor.y, cursor.m, d);
          const isPast = key < todayKey;
          const isStart = key === from;
          const isEnd = key === rangeEnd;
          const inRange = !!from && !!rangeEnd && key >= from && key <= rangeEnd;
          const hasEvent = eventDays.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => pick(key)}
              className={`relative mx-auto flex h-9 w-full max-w-[44px] flex-col items-center justify-center text-sm transition ${
                isStart || isEnd
                  ? "rounded-full bg-accent font-semibold text-on-accent"
                  : inRange
                    ? "bg-accent/20 text-main"
                    : isPast
                      ? "text-tone-700"
                      : "rounded-full text-main hover:bg-main/10"
              } ${key === todayKey && !isStart && !isEnd ? "ring-1 ring-accent/60 rounded-full" : ""}`}
            >
              {d}
              {hasEvent && !isPast && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isStart || isEnd ? "bg-on-accent" : "bg-accent"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
