const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 }, (_, i) => {
  const totalMinutes = i * 15;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});

/** 15分刻みの時刻選択(出勤スケジュール用)。現実的に1分単位の出勤時刻は存在しないため、ネイティブの<input type="time">は使わない。 */
export function TimeSelect({
  name,
  defaultValue,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  className?: string;
}) {
  // DBのtime型は "HH:MM:SS" で返ってくることがあるため、選択肢と合わせて "HH:MM" に揃える。
  const normalized = defaultValue ? defaultValue.slice(0, 5) : "";
  return (
    <select name={name} defaultValue={normalized} className={className}>
      <option value="">未設定</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
