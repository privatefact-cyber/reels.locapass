"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TimeSelect } from "./TimeSelect";

export type TodayScheduleRow = {
  castId: string;
  name: string;
  avatarUrl: string | null;
  scheduleId: string | null;
  isWorkingToday: boolean;
  startTime: string | null;
  endTime: string | null;
};

export function TodayScheduleBoard({
  date,
  rows,
  upsertTodaySchedule,
  castDetailBasePath,
}: {
  /** キャスト詳細ページの親パス(例: /dashboard/shop/[shopId]/cast)。本家の /dashboard/cast に相当。 */
  castDetailBasePath: string;
  date: string;
  rows: TodayScheduleRow[];
  upsertTodaySchedule: (
    castId: string,
    scheduleId: string | null,
    date: string,
    formData: FormData,
  ) => Promise<void>;
}) {
  const [search, setSearch] = useState("");

  // 「今日すでに出勤登録している人」を上に、それ以外は名前順のまま下に並べる。
  // 急な出勤にもスクロールで対応できるよう、非表示にはせず全員を残す。
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aRegistered = a.scheduleId !== null ? 0 : 1;
      const bRegistered = b.scheduleId !== null ? 0 : 1;
      return aRegistered - bRegistered;
    });
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim();
    if (!query) return sortedRows;
    return sortedRows.filter((row) => row.name.includes(query));
  }, [sortedRows, search]);

  const registeredCount = rows.filter((r) => r.scheduleId !== null).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">本日の出勤({date})</h2>
      <p className="mb-4 text-xs text-slate-500">
        今日出勤登録済みの{registeredCount}名を上に表示しています。急な出勤の人は下にスクロールするか名前で検索して追加してください。
      </p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="キャスト名で検索"
        className="mb-3 w-64 max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />

      {visibleRows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {rows.length === 0 ? "在籍中のキャストがいません。" : "該当するキャストがいません。"}
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-black/10 overflow-y-auto pr-1">
          {visibleRows.map((row) => (
            <li key={row.castId} className="py-3">
              <form
                action={upsertTodaySchedule.bind(null, row.castId, row.scheduleId, date)}
                className="flex flex-wrap items-center gap-3"
              >
                {row.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.avatarUrl}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {row.name.slice(0, 1)}
                  </div>
                )}
                <Link
                  href={`${castDetailBasePath}/${row.castId}`}
                  className="w-24 flex-shrink-0 truncate text-sm font-semibold text-slate-900 hover:underline"
                >
                  {row.name}
                </Link>
                <label className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    name="is_working_today"
                    type="checkbox"
                    defaultChecked={row.isWorkingToday}
                    className="h-4 w-4"
                  />
                  出勤する
                </label>
                <TimeSelect
                  name="start_time"
                  defaultValue={row.startTime}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <span className="text-slate-400">〜</span>
                <TimeSelect
                  name="end_time"
                  defaultValue={row.endTime}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  {row.scheduleId ? "保存" : "追加"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
