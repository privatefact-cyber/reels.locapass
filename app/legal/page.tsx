import Link from "next/link";

export const metadata = { title: "特定商取引法に基づく表記" };

// 暫定版。有料サービス(Stripe決済)の開始にあわせて、金額・解約の条件を確認すること。
const ROWS: [string, React.ReactNode][] = [
  ["販売事業者", "Private Factory"],
  ["運営統括責任者", "氏名は、請求があった場合、遅滞なく開示します(下記のメールアドレス宛てに、開示をご請求ください)。"],
  ["所在地", "〒310-0021 茨城県水戸市南町3-3-42 アールズビル2F"],
  ["電話番号", "電話番号は、請求があった場合、遅滞なく開示します(下記のメールアドレス宛てに、開示をご請求ください)。お問い合わせは、メールでお願いします。"],
  ["メールアドレス", "support@locapass.net"],
  ["提供するサービス", "LOCAPASS(locapass.net)の、掲載店舗向けの有料プラン・オプション。閲覧や、一般のご利用は、無料です。"],
  ["販売価格", "各プラン・オプションの申込画面や、ご案内に表示される金額(税込)。"],
  ["商品代金以外の必要料金", "インターネットの接続にかかる通信料(お客様のご負担)。"],
  ["お支払い方法", "クレジットカード(決済事業者: Stripe)"],
  ["お支払い時期", "お申し込み時に、お支払いいただきます。月ごと・年ごとなど、継続して提供するサービスは、お申し込み時の契約期間ごとに、更新日に、自動で課金します。"],
  ["サービスの提供時期", "お支払いの手続きが完了した後、ただちに、または、お申し込み時にお知らせした掲載開始日から、ご利用いただけます。"],
  ["返品・キャンセル", "サービスの性質上、お客様のご都合による、お支払い済みの料金の返金は、できません。継続して提供するサービスは、次回の更新日の前日までに、解約のお手続き(下記のメールアドレスへのご連絡)をいただければ、次回以降の課金を停止します。日割りでの返金は、行いません。運営の都合や、サービスの不具合により、提供できなかった場合は、運営が確認のうえ、返金など、適切に対応します。"],
  ["動作環境", "最新の主要ブラウザ(Chrome、Safari、Edge など)"],
];

export default function Legal() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-6 text-sm leading-7 text-muted md:pt-8">
      <Link href="/" className="text-xs text-muted hover:text-main">← トップへ</Link>
      <h1 className="text-2xl font-bold text-main">特定商取引法に基づく表記</h1>
      <dl className="divide-y divide-main/10 rounded-xl border border-main/15">
        {ROWS.map(([k, v]) => (
          <div key={k} className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr]"><dt className="font-semibold text-main">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs">個人情報の取り扱いは、<Link href="/privacy" className="underline">プライバシーポリシー</Link>をご覧ください。</p>
    </article>
  );
}
