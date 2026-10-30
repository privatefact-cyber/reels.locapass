import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 「開催場所のお知らせ」オプション(譲渡会・イベントなど)の店では、移動販売向けの「出店」を「開催」の言い方に差し替える。
 * 移動販売のポータルは差し替えずに、そのままの文言を使う。
 */
const OVERRIDES: Record<Locale, Partial<Dictionary["shop"]>> = {
  ja: {
    spotAria: "開催場所",
    spotLive: "NOW ─ いま開催中",
    spotNext: "NEXT ─ 次の開催",
    spotPlaceFallback: "開催場所",
    scheduleTitle: "開催スケジュール",
    scheduleEmpty: "日付を選ぶと、その日の開催場所が出ます",
    calendarDay: (m, d, n) => `${m}月${d}日${n > 0 ? `(開催${n}件)` : ""}`,
  },
  en: {
    spotAria: "Event location",
    spotLive: "NOW ─ Happening now",
    spotNext: "NEXT ─ Next event",
    spotPlaceFallback: "Location",
    scheduleTitle: "Event schedule",
    scheduleEmpty: "Pick a date to see where the event will be",
    calendarDay: (m, d, n) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}${n > 0 ? ` (${n} event${n > 1 ? "s" : ""})` : ""}`,
  },
  zh: {
    spotAria: "活动地点",
    spotLive: "NOW ─ 正在举办",
    spotNext: "NEXT ─ 下一场活动",
    spotPlaceFallback: "活动地点",
    scheduleTitle: "活动日程",
    scheduleEmpty: "选择日期,查看当天的活动地点",
    calendarDay: (m, d, n) => `${m}月${d}日${n > 0 ? `(活动${n}场)` : ""}`,
  },
  ar: {
    spotAria: "موقع الفعالية",
    spotLive: "NOW ─ جارية الآن",
    spotNext: "NEXT ─ الفعالية القادمة",
    spotPlaceFallback: "الموقع",
    scheduleTitle: "جدول الفعاليات",
    scheduleEmpty: "اختر تاريخًا لمعرفة موقع الفعالية في ذلك اليوم",
  },
};

export function eventShopDict(shop: Dictionary["shop"], locale: Locale): Dictionary["shop"] {
  return { ...shop, ...OVERRIDES[locale] };
}
