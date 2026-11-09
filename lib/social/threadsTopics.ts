/**
 * Threadsに書くテーマの一覧。
 * 店舗向け(shop): 店舗オーナー向けの集客ノウハウ。 一般向け(public): 街でお店を探す人(地元の人・観光客)向けの紹介。
 * LOCAPASSの機能([稼働])と結びつけやすいものだけにしている。使ったテーマは、しばらく使い回さない。
 */
export type ThreadsAudience = "shop" | "public";
export type ThreadsTopic = { id: string; title: string; angle: string; audience: ThreadsAudience };
type TopicDef = Omit<ThreadsTopic, "audience">;

const SHOP_TOPICS: TopicDef[] = [
  { id: "video-first3s", title: "ショート動画は最初の3秒で決まる", angle: "お店の動画で、最初の3秒に何を見せるとスワイプされにくいか。看板メニュー・湯気・手元など具体例を。" },
  { id: "video-no-staff", title: "撮影に慣れていなくても続けられる動画", angle: "30秒でいい、スマホ1台でいい。続けやすい撮り方と、ネタに困らないコツ。" },
  { id: "video-daily-scene", title: "日常の一コマが一番伝わる", angle: "仕込み、開店前、スタッフの掛け合いなど、飾らない場面がお店の雰囲気を伝える話。" },
  { id: "caption-subtitles", title: "声が入った動画は字幕で届く範囲が変わる", angle: "LOCAPASSは投稿すると英語・中国語の字幕が自動で付き、投稿者が直せる。訪日のお客様に読んでもらえる。" },
  { id: "multilingual", title: "日本語で書くだけで多言語に", angle: "店舗の紹介文・営業時間・料金を日本語で入れると自動翻訳される。翻訳は完璧ではないので、直せる点にも触れる。" },
  { id: "map-find", title: "地図から見つけてもらう", angle: "地図のピンを選ぶとその店の動画が出る。行き先を探している人に見つかる導線。" },
  { id: "info-complete", title: "お店の情報は、埋めるほど選ばれやすい", angle: "営業時間・電話・メニュー・料金・写真がそろっているお店と、空欄のお店の差。公式サイトのURLから下書きを作れる機能も。" },
  { id: "official-url-import", title: "公式サイトのURLを入れるだけで情報の下書き", angle: "店舗情報を一から打たなくていい。取り込んだあとに自分で直せる安心感。" },
  { id: "occupancy", title: "空席状況を見せると来店の背中を押せる", angle: "フロアの写真を撮るとAIが混雑状況を判定して表示する機能。入りやすさが伝わる。" },
  { id: "concierge", title: "『今から行ける店は?』に答えるAI", angle: "AIコンシェルジュはお店の情報を根拠に答える。だから情報を整えておくほど紹介されやすい。" },
  { id: "hours-closed", title: "営業時間と臨時休業は、こまめに更新", angle: "せっかく来てくれたのに閉まっていた、が一番もったいない。更新の手間を減らす考え方。" },
  { id: "price-display", title: "料金が分かると、問い合わせのハードルが下がる", angle: "メニューと料金の見せ方。細かすぎず、目安でも出す価値がある。" },
  { id: "photo-tips", title: "写真1枚目の見せ方", angle: "お店の入口・看板メニュー・人の手元など、初めての人が知りたい順に並べる。" },
  { id: "inbound", title: "訪日のお客様に選ばれるための小さな工夫", angle: "英語・中国語の字幕、地図、写真のわかりやすさ。大きな投資なしでできること。" },
  { id: "line-booking", title: "予約・問い合わせの入口は一本化", angle: "LINEや予約ページへの導線を店舗ページに置く。迷わせない動線の話。" },
  { id: "faces", title: "お店の『人』を見せる", angle: "スタッフ紹介(FACES)があると、初めてでも安心して来店できる。顔出しが難しいときの工夫も。" },
  { id: "event-notice", title: "イベントや期間限定は、日付つきで出す", angle: "いつまで・どこで・何があるかを一目で分かるように。告知の書き方。" },
  { id: "embed-site", title: "自分のサイトにも動画を載せられる", angle: "外部サイトへの埋め込みで、公式サイトにも最新の動画を表示できる。" },
  { id: "qr-short", title: "お店に置くQRコードの使いどころ", angle: "店舗ページへの短縮URL・QRコードを、レジ横やメニューに置く。来店後のリピートにつなぐ。" },
  { id: "pet-friendly", title: "『ペット同伴OK』は強い検索理由", angle: "属性として登録すると探しやすくなる。ペット同伴の条件(サイズ・場所)を書くコツ。" },
  { id: "attributes", title: "駐車場・子連れ・バリアフリーなどの『条件』を載せる", angle: "お客様が来店前に知りたい条件を、属性として整えると選ばれやすい。" },
  { id: "reply-inquiry", title: "問い合わせへの返信は早いほど強い", angle: "問い合わせ対応の窓口を一つにまとめる考え方。返信の型を持っておく。" },
  { id: "seasonal", title: "季節のネタを先取りする", angle: "季節ごとのメニュー・景色・イベントを、少し前から動画にする。" },
  { id: "small-shop", title: "小さなお店ほど、動画が武器になる", angle: "大きな広告予算がなくても、手元のスマホで『らしさ』を伝えられる話。" },
  { id: "local-community", title: "街の中でつながると、遠くから来てくれる", angle: "同じエリアのお店同士が見られる場所に載ることの価値。" },
  { id: "consistency", title: "週に1本でも、続けるほうが強い", angle: "量より継続。無理のない投稿の頻度の決め方。" },
  { id: "first-time-visitor", title: "初めてのお客様の不安をなくす", angle: "入りづらさの正体(価格・雰囲気・混み具合)を、動画と情報で先に解消する。" },
  { id: "ai-time-saving", title: "運営の手間はAIに任せられるところから", angle: "翻訳・字幕・情報の下書き・混雑判定など、LOCAPASSで自動になる部分。人が確認する部分も残る。" },
  { id: "menu-hero", title: "看板メニューを一つ決める", angle: "何屋さんか一言で伝わる『主役』の見せ方。動画も写真もそれを軸に。" },
];

/** 一般向け: 街のお店やスポットを探している人に、LOCAPASSの使いどころを伝える。店舗向けの話(集客・運営)は混ぜない。 */
const PUBLIC_TOPICS: TopicDef[] = [
  { id: "p-map-video", title: "行き先に迷ったら、地図から動画で選ぶ", angle: "地図のピンを選ぶと、そのお店の動画カードが出る。文字だけでなく、雰囲気を見てから決められる。" },
  { id: "p-video-vibe", title: "文字や写真より、動画のほうが空気感が分かる", angle: "お店の『いま』の雰囲気が、30秒ほどの縦動画で伝わる。入りやすいかどうかの判断材料に。" },
  { id: "p-tourist", title: "旅先で言葉が不安でも、字幕つきの動画でお店を選べる", angle: "声の入った動画には、英語・中国語の字幕が自動で付く(自動なので、投稿者が直せる)。訪日のお客様にも。" },
  { id: "p-languages", title: "日本語・英語・中国語・アラビア語で見られる", angle: "画面の表示が4つの言語に対応。アラビア語は右から左の表示にも対応している。" },
  { id: "p-concierge", title: "『今から行ける店は?』をAIに聞いてみる", angle: "AIコンシェルジュが、お店の情報を根拠に答えてくれる。質問した言語で返事が来る。" },
  { id: "p-occupancy", title: "行く前に、混み具合が分かると安心", angle: "お店がフロアの写真を撮ると、AIが空席の状況(空席あり・残りわずか・満席)を判定して表示する機能がある。" },
  { id: "p-no-app", title: "アプリを入れなくても、ブラウザで使える", angle: "スマホのブラウザで開くだけ。ダウンロード不要で、気軽に試せる。" },
  { id: "p-swipe", title: "縦動画をスワイプして、街をぶらぶら眺める", angle: "TikTokやリールのように上下にスワイプして眺める。気になったお店をタップして詳細へ。" },
  { id: "p-shop-page", title: "気になったら、そのまま店舗ページへ", angle: "動画を見て気になったお店は、営業時間・メニュー・地図まで一つのページで確認できる。" },
  { id: "p-area", title: "エリアごとの、話題のお店とスポット", angle: "エリア(ポータル)ごとに、人気スポットや話題のお店を動画で眺められる。" },
  { id: "p-small-shops", title: "ガイドに載りきらない、小さなお店との出会い", angle: "地域の小さなお店も、自分たちで動画を載せている。街歩きの寄り道に。" },
  { id: "p-faces", title: "お店の『人』が見えると、入りやすい", angle: "お店のスタッフを紹介するページ(FACES)があり、顔の見える安心感がある。" },
  { id: "p-weekend", title: "週末の予定を、動画でさくっと決める", angle: "いくつかの動画を見比べて、気分に合うお店を選べる。迷う時間が楽しい時間に。" },
];

export const THREADS_TOPICS: ThreadsTopic[] = [
  ...SHOP_TOPICS.map((t) => ({ ...t, audience: "shop" as const })),
  ...PUBLIC_TOPICS.map((t) => ({ ...t, audience: "public" as const })),
];

/** LUXELA(夜のお店ポータル)。一般向け=夜のお店を探す人。店舗向け=夜のお店のオーナー・店長。 */
const LUXELA_PUBLIC: TopicDef[] = [
  { id: "lx-p-video", title: "お店の雰囲気を、行く前に動画で見る", angle: "夜のお店は、入る前に空気感が分からないと不安。縦動画で店内の雰囲気を先に見られる。" },
  { id: "lx-p-map", title: "今いる場所の近くで、夜のお店を探す", angle: "現在地の近くのお店を地図で探せる。ピンを選ぶとそのお店の情報が出る。" },
  { id: "lx-p-schedule", title: "出勤情報を見てから、行くお店を決める", angle: "お店ごとに、キャストの紹介や出勤の情報を見られる。行く前に確認できる安心感。" },
  { id: "lx-p-shoppage", title: "営業時間・料金の目安・場所が一ページで分かる", angle: "気になったお店の基本情報を、あちこち探さずに一つの店舗ページで確認できる。" },
  { id: "lx-p-genre", title: "キャバクラ・ラウンジ・ガールズバー…気分で選ぶ", angle: "ジャンルが違うと雰囲気も違う。比べながら、その夜の気分に合うお店を探せる。" },
  { id: "lx-p-after", title: "飲んだあとの、深夜に開いているお店探し", angle: "アフター向けに、深夜に開いている飲食店をタグで絞って探せる。" },
  { id: "lx-p-tourist", title: "訪日の友人にも見せられる、多言語の夜のお店ガイド", angle: "日本語のほか、英語・中国語・アラビア語で見られる。旅行者と一緒に夜の街を楽しむときに。" },
  { id: "lx-p-concierge", title: "『今から行けるお店は?』をAIに聞いてみる", angle: "AIコンシェルジュが、お店の情報を根拠に答える。質問した言語で返事が来る。" },
  { id: "lx-p-ranking", title: "ランキングで、人気のキャストをチェック", angle: "毎朝8時に集計。点数は出さず、順位だけを見せる。お店の中のTOP10などを見られる。" },
  { id: "lx-p-noapp", title: "アプリなしで、ブラウザからさっと見られる", angle: "スマホのブラウザで開くだけ。ダウンロード不要で、気軽に試せる。" },
];

const LUXELA_SHOP: TopicDef[] = [
  { id: "lx-s-reel", title: "お店の雰囲気は、縦動画がいちばん伝わる", angle: "夜のお店は入る前の不安が大きい。店内の空気感を短い動画で見せると、初めてのお客様が入りやすくなる。" },
  { id: "lx-s-cast", title: "キャストの紹介と出勤情報を、見やすく", angle: "出勤やキャストの情報が整っているお店は、来店の判断をしてもらいやすい。" },
  { id: "lx-s-info", title: "営業時間・料金の目安・場所を整える", angle: "基本情報がそろった店舗ページは、問い合わせの前に不安を減らせる。" },
  { id: "lx-s-embed", title: "自分の公式サイトにも、出勤情報を載せられる", angle: "出勤・キャスト情報を、スクリプト1本で公式サイトに埋め込める。二重管理の手間が減る。" },
  { id: "lx-s-multilang", title: "訪日のお客様にも見つけてもらう", angle: "LUXELAは英語・中国語・アラビア語にも対応。海外のお客様の目に触れる入口になる。" },
  { id: "lx-s-map", title: "地図から、近くにいる人に見つけてもらう", angle: "現在地の近くのお店を探す人に、地図の上で見つけてもらえる。" },
  { id: "lx-s-consistency", title: "動画は、週に1本でも続ける", angle: "量より継続。無理のない頻度で、お店の『いま』を見せ続ける。" },
];

export const LUXELA_TOPICS: ThreadsTopic[] = [
  ...LUXELA_SHOP.map((t) => ({ ...t, audience: "shop" as const })),
  ...LUXELA_PUBLIC.map((t) => ({ ...t, audience: "public" as const })),
];

/** 投稿先のアカウント(LOCAPASS / LUXELA)に合うテーマの一覧。 */
export function topicsFor(account: "locapass" | "luxela"): ThreadsTopic[] {
  return account === "luxela" ? LUXELA_TOPICS : THREADS_TOPICS;
}

export const AUDIENCE_LABEL: Record<ThreadsAudience, string> = { shop: "店舗向け", public: "一般向け" };
