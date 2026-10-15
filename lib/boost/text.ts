import type { Locale } from "@/lib/i18n/locale";

type Dict = {
  title: string; lead: string; limited: string; remain: string; ended: string; go: string; call: string;
  empty: string; emptySub: string; hint: string; refresh: string; ago: string; more: string; line: string; detail: string; search: string; none: string; back: string; endedPage: string;
};

const T: Record<Locale, Dict> = {
  ja: { detail: "詳細を見る", search: "エリア・店名で検索", none: "条件に合うブーストがありません。", line: "LINE予約", back: "一覧へ戻る", endedPage: "このブーストは終了しました。", title: "緊急ブースト", lead: "ドタキャン・作りすぎ…今だけの超お得情報。見てそのままお店へ！", limited: "1時間限定", remain: "残り", ended: "終了しました", go: "お店へ行く", call: "電話予約", empty: "いま掲載中のブーストはありません。", emptySub: "新しいブーストが出たら、ここに表示されます。", hint: "お店で「locapassを見た」と伝えてください", refresh: "自動で更新されます", ago: "掲載", more: "店舗詳細を見る" },
  en: { detail: "See details", search: "Search by area or shop", none: "No boosts match.", line: "Book via LINE", back: "Back to list", endedPage: "This boost has ended.", title: "Flash Boost", lead: "Last-minute cancellations & surplus food: limited-time deals. See it, go there!", limited: "1 hour only", remain: "Left", ended: "Ended", go: "Get directions", call: "Call to book", empty: "No boosts right now.", emptySub: "New boosts will appear here.", hint: "Tell the shop \"I saw it on locapass\"", refresh: "Updates automatically", ago: "Posted", more: "View shop details" },
  zh: { detail: "查看详情", search: "按区域或店名搜索", none: "没有符合条件的加速。", line: "LINE预约", back: "返回列表", endedPage: "此加速已结束。", title: "紧急加速", lead: "临时取消、备货过多…限时特惠，看到就直接去店里！", limited: "限时1小时", remain: "剩余", ended: "已结束", go: "前往店铺", call: "电话预约", empty: "目前没有进行中的加速。", emptySub: "有新的加速时会显示在这里。", hint: "到店后请告知「我在locapass看到的」", refresh: "自动更新", ago: "发布", more: "查看店铺详情" },
  ar: { detail: "عرض التفاصيل", search: "ابحث بالمنطقة أو اسم المتجر", none: "لا توجد عروض مطابقة.", line: "الحجز عبر LINE", back: "العودة إلى القائمة", endedPage: "انتهى هذا العرض.", title: "عرض عاجل", lead: "إلغاءات اللحظة الأخيرة وفائض الطعام: عروض لوقت محدود. شاهد واذهب مباشرة!", limited: "ساعة واحدة فقط", remain: "متبقي", ended: "انتهى", go: "الاتجاهات", call: "حجز بالهاتف", empty: "لا توجد عروض عاجلة حالياً.", emptySub: "ستظهر العروض الجديدة هنا.", hint: "أخبر المتجر «رأيتها على locapass»", refresh: "يتم التحديث تلقائياً", ago: "نُشر", more: "تفاصيل المتجر" },
};

export type BoostText = Dict;
export function boostText(locale: Locale): BoostText {
  return T[locale] ?? T.ja;
}
