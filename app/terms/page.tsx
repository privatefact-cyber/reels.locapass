import Link from "next/link";

export const metadata = { title: "利用規約" };

// 暫定版。機能や有料サービスの内容が変わったら、見直すこと。
export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 text-sm leading-7 text-muted md:pt-8">
      <Link href="/" className="text-xs text-muted hover:text-main">← トップへ</Link>
      <h1 className="text-2xl font-bold text-main">利用規約</h1>
      <p className="text-xs">制定: 2026年10月</p>

      <section><h2 className="mb-1 text-base font-bold text-main">第1条(title)</h2>
        <div className="space-y-2">
          <p>この利用規約(以下「本規約」)は、Private Factory(以下「運営」)が提供するLOCAPASS(locapass.net。以下「本サービス」)の、利用条件を定めるものです。</p>
          <p>本サービスを利用する方(閲覧のみの方を含みます。以下「利用者」)は、本規約に同意したうえで、ご利用ください。運営が本サービス上で別に定める注意事項やガイドラインは、本規約の一部となります。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第2条(title)</h2>
        <div className="space-y-2">
          <p>「店舗」とは、本サービスに掲載される、または、掲載を希望する、事業者(店舗・施設・事業所)をいいます。</p>
          <p>「キャスト」とは、店舗に所属し、または、店舗の許可を得て、本サービスに投稿する方をいいます。</p>
          <p>「投稿コンテンツ」とは、利用者が、本サービスに投稿・登録した、画像、動画、文章、コメント、プロフィールなどの、一切の情報をいいます。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第3条(title)</h2>
        <div className="space-y-2">
          <p>運営は、必要と判断した場合、本規約を変更できます。変更後の規約は、本サービス上に掲載した時点から、効力を生じます。重要な変更は、本サービス上で、お知らせします。変更後も本サービスを利用した場合、変更に同意したものとみなします。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第4条(title)</h2>
        <div className="space-y-2">
          <p>本サービスを利用できます。</p>
          <p>投稿や管理の機能は、LINE・Google・メールアドレス・ID等による、ログインが必要です。登録する情報は、正確かつ最新のものにしてください。</p>
          <p>アカウントとログイン情報は、ご自身で、厳重に管理してください。第三者による使用で生じた損害について、運営は、責任を負いません(運営に故意または重過失がある場合を除きます)。</p>
          <p>1人で複数のアカウントを作成して、制限を回避する行為や、他人になりすます行為は、禁止します。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第5条(title)</h2>
        <div className="space-y-2">
          <p>利用者は、いつでも、運営へのご連絡により、退会(アカウントの削除)ができます。退会後、投稿コンテンツや、登録情報は、運営が定める方法で、削除または非公開とします。ただし、法令に基づき、または、不正の防止のために、必要な情報は、一定期間、保管することがあります。</p>
          <p>有料サービスをご利用中の場合は、退会しても、お支払い済みの料金は、返金されません。また、継続して提供するサービスは、解約の手続きが、別に必要です。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第6条(title)</h2>
        <div className="space-y-2">
          <p>本サービスの閲覧と、一般のご利用は、無料です。店舗向けの有料プラン・オプションの内容、料金、支払い方法は、申込画面やご案内に表示します。決済は、決済事業者(Stripe)を通じて行います。</p>
          <p>継続して提供するサービスは、契約期間ごとの更新日に、自動で更新・課金されます。解約は、次回の更新日の前日までに、運営へご連絡ください。お支払い済みの料金は、法令で定める場合や、運営の責めに帰すべき事由がある場合を除き、返金しません。</p>
          <p>詳しくは、「特定商取引法に基づく表記」をご覧ください。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第7条(title)</h2>
        <div className="space-y-2">
          <p>投稿コンテンツの著作権その他の権利は、投稿した方に帰属します。</p>
          <p>投稿した方は、運営に対し、投稿コンテンツを、本サービス内での表示・配信、本サービスの宣伝・広報(運営の公式SNS、広告、プレスリリース等への掲載を含みます)のために、無償で、国内外で、期間の定めなく、使用・複製・公衆送信・翻訳・編集(切り取り、サムネイル化、字幕・タグの付与など)することを、許諾します。この許諾は、非独占的なものです。</p>
          <p>投稿した方は、投稿コンテンツについて、自らが、投稿に必要な権利を有していること、第三者の権利(著作権、肖像権、プライバシー、パブリシティ権など)を侵害しないこと、写っている方や、関係する店舗の、必要な同意を得ていることを、保証します。</p>
          <p>投稿コンテンツに関して、第三者との間で紛争が生じた場合は、投稿した方が、自己の責任と費用で、解決するものとします。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第8条(title)</h2>
        <div className="space-y-2">
          <p>利用者は、次の行為をしてはなりません。</p>
          <p>・法令、または、公序良俗に反する行為</p>
          <p>・他人の権利(著作権、肖像権、プライバシー、名誉、信用など)を侵害する行為</p>
          <p>・虚偽の情報、誤解を招く情報の投稿や、他人・他店舗へのなりすまし</p>
          <p>・他人の個人情報を、無断で、投稿・収集する行為</p>
          <p>・わいせつ、暴力的、差別的、脅迫的、または、他人を著しく不快にさせる内容の投稿</p>
          <p>・本サービスを通じた、勧誘、宣伝、営業(運営が認めたものを除きます)、および、違法・不適切な外部サービスへの誘導</p>
          <p>・不正アクセス、サーバーやネットワークへの過度な負荷、自動化されたツールによる、情報の大量取得(スクレイピング)や、投稿・閲覧の水増し</p>
          <p>・他の利用者や、店舗・キャストへの、誹謗中傷、迷惑行為、つきまとい</p>
          <p>・運営、または、他の利用者の、業務を妨害する行為、および、本サービスや運営の信用を損なう行為</p>
          <p>・店舗の関係者でないのに店舗として、または、キャストでないのにキャストとして、登録・投稿する行為</p>
          <p>・本サービスで知り得た情報(店舗・キャスト・他の利用者の連絡先など)を、運営の承認なく、営業・勧誘などの目的に利用する行為</p>
          <p>・登録情報や、ログイン情報を、不正に利用する行為</p>
          <p>・反社会的勢力への利益供与や、反社会的勢力であることを示す行為</p>
          <p>上記のほか、運営が不適切と判断する行為。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第9条(title)</h2>
        <div className="space-y-2">
          <p>店舗は、営業に必要な許認可等を適法に取得し、法令を守って営業していることを、保証します。</p>
          <p>キャストが投稿する場合は、所属する店舗や、関係者の許可を得てください。店舗は、所属するキャストの投稿について、適切に管理する責任を負います。</p>
          <p>掲載する営業時間、料金、サービス内容などの情報は、最新かつ正確なものにしてください。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第10条(title)</h2>
        <div className="space-y-2">
          <p>運営は、投稿コンテンツが、本規約に違反する、または、そのおそれがあると判断した場合、また、通報があった場合や、安全の確保のために必要と判断した場合、事前の通知なく、投稿の非公開・削除、アカウントの利用停止・削除、掲載の中止などの措置を取ることができます。</p>
          <p>運営は、投稿コンテンツを、監視する義務を負うものではありません。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第11条(title)</h2>
        <div className="space-y-2">
          <p>本サービスには、AI(人工知能)による案内・おすすめ・翻訳・自動の分類などの機能があります。AIの回答や出力は、正確性・完全性を保証するものではなく、参考情報です。営業時間・料金・空き状況・アレルギー等の重要な事項は、必ず、店舗にご確認ください。</p>
          <p>AIへの入力に、個人情報や、秘密にしたい情報を、含めないでください。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第12条(title)</h2>
        <div className="space-y-2">
          <p>位置情報や、プッシュ通知は、端末の許可がある場合に限り、利用します。許可は、端末の設定から、いつでも変更・取り消しができます。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第13条(title)</h2>
        <div className="space-y-2">
          <p>本サービスから、他社のサイトやサービス(地図、SNS、各店舗のサイトなど)へ、リンクする場合があります。リンク先の内容や、利用によって生じた損害について、運営は、責任を負いません。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第14条(title)</h2>
        <div className="space-y-2">
          <p>運営は、利用者への事前の通知なく、本サービスの内容を変更し、または、保守・障害・天災などの事由により、一時的に中断することができます。また、運営は、相当の期間を置いて、お知らせしたうえで、本サービスの全部または一部を終了できます。これらによって生じた損害について、運営は、責任を負いません(運営に故意または重過失がある場合を除きます)。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第15条(title)</h2>
        <div className="space-y-2">
          <p>本サービスは、現状のまま提供するものです。運営は、掲載情報、投稿コンテンツ、口コミ、AIの出力などの、正確性、最新性、安全性、有用性を、保証しません。</p>
          <p>利用者と、店舗・キャスト・他の利用者との間で生じた、取引、トラブル、紛争については、当事者間で解決するものとし、運営は、責任を負いません。</p>
          <p>運営が、本サービスの利用に関して、利用者に対して損害賠償の責任を負う場合は、運営に故意または重過失がある場合を除き、通常生じる直接の損害に限り、有料サービスについては、その損害が生じた月に、利用者が運営に支払った料金を上限とします。ただし、消費者契約法その他の法令により、運営の責任を、免除・制限できない場合は、この限りではありません。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第16条(title)</h2>
        <div className="space-y-2">
          <p>利用者は、自らが、暴力団、暴力団員、その他の反社会的勢力に該当しないこと、および、将来にわたって該当しないことを、表明・保証します。該当することが判明した場合、運営は、催告なく、利用の停止や契約の解除ができます。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第17条(title)</h2>
        <div className="space-y-2">
          <p>運営は、利用者の個人情報を、「プライバシーポリシー」に従って、取り扱います。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第18条(title)</h2>
        <div className="space-y-2">
          <p>利用者は、本規約に基づく権利や義務を、第三者に、譲渡・承継させることはできません。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第19条(title)</h2>
        <div className="space-y-2">
          <p>本規約は、日本法に従って解釈されます。本サービスに関して、紛争が生じた場合は、水戸地方裁判所を、第一審の専属的合意管轄裁判所とします(ただし、法令で、他の裁判所の管轄が定められている場合を除きます)。</p>
        </div></section>

      <section><h2 className="mb-1 text-base font-bold text-main">第20条(title)</h2>
        <div className="space-y-2">
          <p>運営者: Private Factory ／ 所在地: 〒310-0021 茨城県水戸市南町3-3-42 アールズビル2F ／ 連絡先: support@locapass.net</p>
        </div></section>

      <p className="text-xs">個人情報の取り扱いは、<Link href="/privacy" className="underline">プライバシーポリシー</Link>、有料サービスの取引条件は、<Link href="/legal" className="underline">特定商取引法に基づく表記</Link>をご覧ください。</p>
    </article>
  );
}
