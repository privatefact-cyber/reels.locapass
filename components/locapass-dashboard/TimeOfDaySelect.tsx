"use client";

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

/** 15分刻みの時刻セレクト。空選択(未指定)可。 */
export function TimeOfDaySelect({
  name,
  defaultValue,
  className,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className={
        className ?? "rounded border border-black/20 bg-white px-2 py-2 text-sm text-black"
      }
    >
      <option value="">時刻未指定</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
