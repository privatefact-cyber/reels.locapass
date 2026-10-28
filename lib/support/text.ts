import type { Locale } from "@/lib/i18n/locale";

type T = {
  title: string; lead: string; placeholder: string; send: string; thinking: string; guide: string; user: string; shop: string;
  helpful: string; notHelpful: string; thanks: string;
  unknown: string; escalate: string; contactPh: string; escalated: string; sample: string; empty: string; links: string; disclaimer: string; reset: string;
};
const D: Record<Locale, T> = {
  ja: { helpful: "役に立った", notHelpful: "役に立たなかった", thanks: "ご評価ありがとうございます。", title: "サポート・使い方", lead: "locapassの使い方を、AIがお答えします。", placeholder: "例: ブーストってなに? 写真の投稿のしかたは?", send: "送信", thinking: "考えています…", guide: "使い方ガイド", user: "お客様向け", shop: "店舗の管理者向け", unknown: "AIが答えられなかったときは、運営に質問を送れます。", escalate: "運営に質問を送る", contactPh: "返信先(メール・LINEなど。任意)", escalated: "運営に送りました。ありがとうございます。", sample: "よくある質問", empty: "下の質問例をタップするか、自由に質問してください。", links: "関連ページ", disclaimer: "AIによる案内です。内容が違うときは、運営へご連絡ください。", reset: "会話をリセット" },
  en: { helpful: "Helpful", notHelpful: "Not helpful", thanks: "Thanks for your feedback.", title: "Help & How to use", lead: "Ask the AI how to use locapass.", placeholder: "e.g. What is Boost? How do I post a photo?", send: "Send", thinking: "Thinking…", guide: "Guides", user: "For visitors", shop: "For shop managers", unknown: "If the AI can't answer, you can send your question to our team.", escalate: "Send to our team", contactPh: "Your email or LINE (optional)", escalated: "Sent to our team. Thank you.", sample: "Common questions", empty: "Tap a sample question below or ask freely.", links: "Related pages", disclaimer: "AI-generated guidance. Contact us if something seems wrong.", reset: "Reset" },
  zh: { helpful: "有帮助", notHelpful: "没有帮助", thanks: "感谢您的反馈。", title: "帮助与使用方法", lead: "AI会解答locapass的使用方法。", placeholder: "例如:什么是Boost?如何发布照片?", send: "发送", thinking: "思考中…", guide: "使用指南", user: "面向用户", shop: "面向店铺管理者", unknown: "AI无法回答时,可以把问题发送给运营团队。", escalate: "发送给运营", contactPh: "回复方式(邮箱或LINE,选填)", escalated: "已发送给运营,谢谢。", sample: "常见问题", empty: "点击下方示例问题,或自由提问。", links: "相关页面", disclaimer: "AI生成的指引。如有出入,请联系运营。", reset: "重置" },
  ar: { helpful: "مفيد", notHelpful: "غير مفيد", thanks: "شكرًا على ملاحظاتك.", title: "المساعدة وكيفية الاستخدام", lead: "اسأل الذكاء الاصطناعي عن كيفية استخدام locapass.", placeholder: "مثال: ما هو Boost؟ كيف أنشر صورة؟", send: "إرسال", thinking: "جارٍ التفكير…", guide: "الأدلة", user: "للزوار", shop: "لمديري المتاجر", unknown: "إذا لم يتمكن الذكاء الاصطناعي من الإجابة، يمكنك إرسال سؤالك إلى الفريق.", escalate: "إرسال إلى الفريق", contactPh: "بريدك أو LINE (اختياري)", escalated: "تم الإرسال إلى الفريق. شكراً.", sample: "أسئلة شائعة", empty: "اضغط على سؤال أدناه أو اسأل بحرية.", links: "صفحات ذات صلة", disclaimer: "إرشاد من الذكاء الاصطناعي. تواصل معنا إذا بدا خاطئاً.", reset: "إعادة" },
};
export const supportText = (l: Locale): T => D[l] ?? D.ja;

export const SAMPLE_QUESTIONS: Record<"user" | "shop", string[]> = {
  user: ["緊急ブーストってなに?", "写真・動画の投稿のしかたは?", "優先予約のデポジットはいくら?", "言語を切り替えたい"],
  shop: ["ブーストの出し方を教えて", "予約が届いたらどうすればいい?", "キャンセル料を請求するには?", "マイページに投稿ボタンがない"],
};
