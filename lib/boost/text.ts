import type { Locale } from "@/lib/i18n/locale";

type Dict = {
  title: string; lead: string; limited: string; remain: string; ended: string; go: string; call: string;
  empty: string; emptySub: string; hint: string; refresh: string; ago: string; more: string;
};

const T: Record<Locale, Dict> = {
  ja: { title: "緊急ブースト", lead: "ドタキャン・作りすぎ…今だけの超お得情報。見てそのままお店へ！", limited: "1時間限定", remain: "残り", ended: "終了しました", go: "お店へ行く", call: "電話する", empty: "いま掲載中のブーストはありません。", emptySub: "新しいブーストが出たら、ここに表示されます。", hint: "お店で「locapassを見た」と伝えてください", refresh: "自動で更新されます", ago: "掲載", more: "お店のページ" },
  en: { title: "Flash Boost", lead: "Last-minute cancellations & surplus food: limited-time deals. See it, go there!", limited: "1 hour only", remain: "Left", ended: "Ended", go: "Get directions", call: "Call", empty: "No boosts right now.", emptySub: "New boosts will appear here.", hint: "Tell the shop \"I saw it on locapass\"", refresh: "Updates automatically", ago: "Posted", more: "Shop page" },
  zh: { title: "紧急加速", lead: "临时取消、备货过多…限时特惠，看到就直接去店里！", limited: "限时1小时", remain: "剩余", ended: "已结束", go: "前往店铺", call: "致电", empty: "目前没有进行中的加速。", emptySub: "有新的加速时会显示在这里。", hint: "到店后请告知「我在locapass看到的」", refresh: "自动更新", ago: "发布", more: "店铺页面" },
  ar: { title: "عرض عاجل", lead: "إلغاءات اللحظة الأخيرة وفائض الطعام: عروض لوقت محدود. شاهد واذهب مباشرة!", limited: "ساعة واحدة فقط", remain: "متبقي", ended: "انتهى", go: "الاتجاهات", call: "اتصال", empty: "لا توجد عروض عاجلة حالياً.", emptySub: "ستظهر العروض الجديدة هنا.", hint: "أخبر المتجر «رأيتها على locapass»", refresh: "يتم التحديث تلقائياً", ago: "نُشر", more: "صفحة المتجر" },
};

export type BoostText = Dict;
export function boostText(locale: Locale): BoostText {
  return T[locale] ?? T.ja;
}
