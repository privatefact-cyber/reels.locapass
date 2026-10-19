// 店舗の営業時間(曜日ごとのカレンダー形式)。NOWタブの「今営業中」判定と、店舗詳細の表示に使う。
// 形式: 曜日ごとに「定休日」か、1つ以上の時間帯(open〜close)。closeがopen以前なら翌日にまたがる(18:00〜03:00など)。
// 「LAST」を選んだ時間帯は、終了を深夜3:00として扱う。

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type HoursRange = { open: string; close: string; last?: boolean };
export type DayHours = { closed: boolean; ranges: HoursRange[] };
export type WeeklyHours = Record<DayKey, DayHours>;

export const LAST_CLOSE = "03:00";
const DAY_MIN = 24 * 60;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function normTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(TIME_RE);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function effectiveClose(r: HoursRange): string {
  return r.last ? LAST_CLOSE : r.close;
}

export function emptyWeek(): WeeklyHours {
  return Object.fromEntries(DAY_KEYS.map((k) => [k, { closed: true, ranges: [] }])) as unknown as WeeklyHours;
}

/**
 * DB・フォームから来た値を検証して正規化する。不正・空ならnull(=未記入)。
 * 時間帯が1つも無い曜日は定休日として扱う。全曜日が定休日のときも「記入あり」(常に閉店)として返す。
 */
export function sanitizeWeekly(raw: unknown): WeeklyHours | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = emptyWeek();
  let any = false;
  for (const key of DAY_KEYS) {
    const d = src[key] as { closed?: unknown; ranges?: unknown } | undefined;
    if (!d || typeof d !== "object") continue;
    any = true;
    if (d.closed === true || !Array.isArray(d.ranges)) continue;
    const ranges: HoursRange[] = [];
    for (const r of d.ranges.slice(0, 4)) {
      const open = normTime((r as HoursRange)?.open);
      const last = (r as HoursRange)?.last === true;
      const close = last ? LAST_CLOSE : normTime((r as HoursRange)?.close);
      if (open && close) ranges.push({ open, close, ...(last ? { last: true } : {}) });
    }
    if (ranges.length) out[key] = { closed: false, ranges };
  }
  return any ? out : null;
}

/** 今(JST)が営業時間内か。未記入(null)は常にfalse。nowJstはgetJstNow()の値(UTC getterがJSTの壁時計)。 */
export function isOpenNow(weekly: WeeklyHours | null, nowJst: Date): boolean {
  if (!weekly) return false;
  const today = (nowJst.getUTCDay() + 6) % 7; // 月=0 ... 日=6
  const yesterday = (today + 6) % 7;
  const nowMin = nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes();

  for (const r of weekly[DAY_KEYS[today]].ranges) {
    const open = toMinutes(r.open);
    let close = toMinutes(effectiveClose(r));
    if (close <= open) close += DAY_MIN;
    if (nowMin >= open && nowMin < close) return true;
  }
  // 前日からの深夜またぎ(例: 前日18:00〜03:00の「03:00まで」の部分)
  for (const r of weekly[DAY_KEYS[yesterday]].ranges) {
    const open = toMinutes(r.open);
    const close = toMinutes(effectiveClose(r));
    if (close <= open && nowMin < close) return true;
  }
  return false;
}

/** 表示用: 同じ内容の連続した曜日をまとめる(例: 月〜金 18:00〜03:00 / 土 18:00〜00:00 / 日 定休日)。 */
/** 開始と終了が同じ時刻(00:00〜00:00)は24時間営業。 */
export function isAllDay(r: HoursRange): boolean {
  return !r.last && r.open === r.close;
}

function rangeText(r: HoursRange, labels: { last: string; allDay: string }): string {
  return isAllDay(r) ? labels.allDay : `${r.open}〜${r.last ? labels.last : r.close}`;
}

export function summarizeWeekly(
  weekly: WeeklyHours,
  labels: { days: Record<DayKey, string>; closed: string; last: string; allDay: string; sep: string },
): { days: string; hours: string }[] {
  const text = (d: DayHours) =>
    d.closed || d.ranges.length === 0
      ? labels.closed
      : d.ranges.map((r) => rangeText(r, labels)).join(" / ");
  const rows: { keys: DayKey[]; hours: string }[] = [];
  for (const key of DAY_KEYS) {
    const h = text(weekly[key]);
    const prev = rows[rows.length - 1];
    if (prev && prev.hours === h) prev.keys.push(key);
    else rows.push({ keys: [key], hours: h });
  }
  return rows.map((r) => ({
    days:
      r.keys.length === 1
        ? labels.days[r.keys[0]]
        : `${labels.days[r.keys[0]]}${labels.sep}${labels.days[r.keys[r.keys.length - 1]]}`,
    hours: r.hours,
  }));
}

const LABELS: Record<string, { days: Record<DayKey, string>; closed: string; last: string; allDay: string; sep: string }> = {
  ja: { days: { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" }, closed: "定休日", last: "LAST", allDay: "24時間営業", sep: "〜" },
  en: { days: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }, closed: "Closed", last: "Last call", allDay: "Open 24 hours", sep: "–" },
  zh: { days: { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" }, closed: "休息", last: "营业至最后", allDay: "24小时营业", sep: "至" },
  ar: { days: { mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت", sun: "الأحد" }, closed: "مغلق", last: "حتى الإغلاق", allDay: "مفتوح 24 ساعة", sep: "–" },
};

/** 店舗詳細に出す複数行テキスト(曜日ごとにまとめた営業時間)。 */
export function weeklyToText(weekly: WeeklyHours, locale: string): string {
  const labels = LABELS[locale] ?? LABELS.en;
  return summarizeWeekly(weekly, labels)
    .map((r) => `${r.days}  ${r.hours}`)
    .join("\n");
}

/** 今日(JST)の営業時間を1行で。定休日・未設定の曜日はnull。トップの店舗紹介など1行表示向け。 */
export function todayHoursText(weekly: WeeklyHours, nowJst: Date, locale: string): string | null {
  const labels = LABELS[locale] ?? LABELS.en;
  const d = weekly[DAY_KEYS[(nowJst.getUTCDay() + 6) % 7]];
  if (d.closed || d.ranges.length === 0) return labels.closed;
  return d.ranges.map((r) => rangeText(r, labels)).join(" / ");
}
