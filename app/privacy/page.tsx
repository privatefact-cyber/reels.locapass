import Link from "next/link";

export const metadata = { title: "プライバシーポリシー" };

// 暫定版。内容は、各機能の実態に合わせて、運営が見直すこと(機能を足したら、ここも更新する)。
export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 text-sm leading-7 text-muted md:pt-8">
      <Link href="/" className="text-xs text-muted hover:text-main">← トップへ</Link>
      <h1 className="text-2xl font-bold text-main">プライバシーポリシー</h1>
      <p className="text-xs">制定: 2026年10月。LOCAPASS(locapass.net。以下「本サービス」)の運営者(以下「運営」)は、利用者の情報を、次のとおり取り扱います。</p>

      <section><h2 className="mb-1 text-base font-bold text-main">1. 取得する情報</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>ログインに関する情報: LINE・Google・メールアドレス等のアカウントを識別するための ID、表示名。パスワードは、暗号化(ハッシュ化)して保管し、運営も、読み取れません。</li>
          <li>店舗・キャストの登録情報: 店舗名、表示名(源氏名など)、プロフィール、投稿した画像・動画・文章、連絡先。登録や確認のために、運営または店舗へ提出された情報(氏名、生年月日、連絡先など。提出された場合のみ)。</li>
          <li>利用の記録: 閲覧したページ、操作、投稿へのコメント・お気に入り・フォロー、お問い合わせの内容、アクセス元の端末・ブラウザの種類。</li>
          <li>位置情報(端末で許可した場合のみ): 「近く」や「マップ」など、現在地に合わせた表示のために利用します。許可は、端末の設定から、いつでも取り消せます。</li>
          <li>通知の宛先(通知を許可した場合のみ): プッシュ通知を送るための、端末・ブラウザごとの宛先情報。</li>
          <li>AIコンシェルジュ(問い合わせAI)への入力内容と、AIからの回答の記録。</li>
          <li>有料サービスのお支払い: カード番号などの決済情報は、決済事業者(Stripe)が取得・保管し、運営は、保管しません。運営が保管するのは、お支払いの有無や、契約の状況のみです。</li>
        </ul></section>

      <section><h2 className="mb-1 text-base font-bold text-main">2. 利用目的</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>本サービスの提供・運営(ログイン、投稿の表示、通知、地図・検索、AIによる案内、有料サービスの提供と請求)</li>
          <li>不正・迷惑行為の防止、規約違反や権利侵害への対応、安全の確保</li>
          <li>お問い合わせへの対応</li>
          <li>サービスの改善、利用状況の統計の作成(個人を特定しない形で行います)</li>
        </ul></section>

      <section><h2 className="mb-1 text-base font-bold text-main">3. 情報の公開範囲</h2>
        <p>店舗・キャストが投稿した内容(画像・動画・文章・表示名など)は、本サービス上で、公開されます。ログイン情報、連絡先、提出された確認書類、通知の宛先などは、公開されず、ご本人と運営(必要な範囲)のみが取り扱います。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">4. 外部への委託・提供</h2>
        <p>法令に基づく場合を除き、ご本人の同意なく、個人情報を第三者に提供しません。ただし、本サービスの運営のため、次の事業者のサービスを利用し、必要な範囲で、情報の取り扱いを委託しています。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>サイトの運営、データの保管、画像・動画の保管と配信を行う、クラウド事業者</li>
          <li>決済: Stripe</li>
          <li>ログイン: LINE、Google</li>
          <li>地図・場所の情報の表示: 地図サービスの事業者</li>
          <li>AIによる案内・文章の生成・翻訳・自動の分類(不適切な投稿の検出を含む)を行う、外部の生成AIサービスの事業者</li>
          <li>プッシュ通知の配信: ブラウザ・端末の提供元が運営する通知の仕組み</li>
        </ul>
        <p className="mt-2">これらの事業者の一部は、日本国外にサーバーを置いており、情報が、国外で取り扱われることがあります。委託先に対しては、情報を適切に取り扱うよう、必要な管理を行います。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">5. Cookie・類似の技術</h2>
        <p>ログイン状態の維持、言語や表示の設定の保存、不正の防止のために、Cookie やブラウザの保存領域を使います。また、サービスの改善のため、利用状況を、個人を特定しない統計として集めることがあります。ブラウザの設定で Cookie を無効にできますが、ログインなど、一部の機能が使えなくなることがあります。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">6. 保管期間</h2>
        <p>利用目的に必要な期間、保管します。アカウントを削除したときや、利用目的がなくなったときは、法令で保管が必要なものを除き、遅滞なく削除または匿名化します。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">7. 開示・訂正・削除などの請求</h2>
        <p>ご自身の個人情報の、開示・訂正・削除・利用停止などをご希望の場合は、下記の窓口に、ご連絡ください。ご本人であることを確認したうえで、法令に従って、対応します。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">8. 安全管理と、改定</h2>
        <p>アクセスできる者を限定し、通信を暗号化するなど、情報の漏えい・滅失を防ぐために必要な措置を講じます。この方針は、必要に応じて改定し、改定後は、このページに掲載します。</p></section>

      <section><h2 className="mb-1 text-base font-bold text-main">9. お問い合わせ窓口</h2>
        <p>運営者: Private Factory ／ 所在地: 〒310-0021 茨城県水戸市南町3-3-42 アールズビル2F ／ 連絡先: support@locapass.net</p></section>
    </article>
  );
}
