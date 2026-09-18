// 出勤スケジュール(schedules.start_time / end_time, JST)から「今まさに稼働中か」を判定する。
// 出勤前後1時間はバッファとして「稼働中」に含める。深夜跨ぎのシフト(例: 20:00〜翌2:00)にも対応するため、
// 「昨日始点0時」を起点とした48時間の連続タイムラインに変換して比較する。

const BUFFER_MIN = 60;
const DAY_MIN = 24 * 60;

export type ScheduleWindow = {
  /** schedules.date (YYYY-MM-DD)。JSTのカレンダー日。 */
  date: string;
  /** schedules.start_time / end_time (HH:MM:SS)。 */
  startTime: string;
  endTime: string;
};

/** 現在時刻をJSTの壁時計として返す(UTC getterでJSTの年月日時分が取れるようDateを+9hシフトしてある)。 */
export function getJstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function toJstDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * schedulesの行のうち、「昨日」または「今日」の日付を持つものだけを渡すこと
 * (深夜跨ぎシフトの判定に昨日分が必要なため)。
 */
export function isWithinWorkingWindow(
  window: ScheduleWindow,
  todayStr: string,
  yesterdayStr: string,
  nowJst: Date,
): boolean {
  const dayOffset = window.date === todayStr ? 1 : window.date === yesterdayStr ? 0 : null;
  if (dayOffset === null) return false;

  const startMin = timeToMinutes(window.startTime);
  let endMin = timeToMinutes(window.endTime);
  if (endMin <= startMin) endMin += DAY_MIN; // 深夜跨ぎ(例: 20:00〜02:00)

  const absStart = dayOffset * DAY_MIN + startMin - BUFFER_MIN;
  const absEnd = dayOffset * DAY_MIN + endMin + BUFFER_MIN;
  const nowAbs = DAY_MIN + (nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes());

  return nowAbs >= absStart && nowAbs <= absEnd;
}
