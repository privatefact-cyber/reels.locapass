import type { Locale } from "./locale";

// UIの固定文言のみを対象にした翻訳辞書。店舗・キャストが入力したコンテンツ
// (紹介文・PR文・日記・イベント告知など)はここでは扱わない(別問題として扱う)。
// ダッシュボード/管理画面(店舗・キャスト・運営向け)は日本語のみのため未収録。
export type Dictionary = {
  nav: {
    home: string;
    events: string;
    favorites: string;
    notifications: string;
    mypage: string;
    menu: string;
    now: string;
    nowShort: string;
    search: string;
    map: string;
  };
  map: {
    searchPlaceholder: string;
    search: string;
    searching: string;
    notFound: string;
    useMyLocation: string;
    noVenuesInView: string;
    zoomIn: string;
    noPreview: string;
    visitNow: string;
    details: string;
    sameBuilding: (count: number) => string;
    all: string;
    watchReels: string;
    reelsEnd: string;
    carTime: (minutes: number) => string;
    walkTime: (minutes: number) => string;
    walkNow: string;
  };
  common: {
    posts: string;
    likes: string;
    follow: string;
    following: string;
    unfollow: string;
    seeShopPage: string;
    openThisPage: string;
    close: string;
    loading: string;
    addToFavorites: string;
    favorited: string;
    share: string;
    fullscreen: string;
    loadFailed: string;
    learnMore: string;
    linkCopied: string;
    noMedia: string;
    unmute: string;
    mute: string;
  };
  shop: {
    todaySchedule: string;
    todaySubtitle: string;
    noScheduleToday: string;
    allCast: string;
    noCast: string;
    priceList: string;
    eventAnnouncement: string;
    usageNotes: string;
    officialSite: string;
    routeGuide: string;
    address: string;
    phone: string;
    businessHours: string;
    priceInfo: string;
    navSchedule: string;
    navCast: string;
    navPrice: string;
    navAccess: string;
    navContact: string;
    inquiryButton: string;
    inquiryModalTitlePrefix: string;
    inquiryModalTitleSuffix: string;
    inquiryModalHint: string;
    inquiryNamePlaceholder: string;
    inquiryContactPlaceholder: string;
    inquiryBodyPlaceholder: string;
    inquirySendFailed: string;
    inquirySending: string;
    inquirySubmit: string;
    autoTranslated: string;
    areaNotSet: string;
    genreNotSet: string;
    archiveTitle: string;
    userPhotosTitle: string;
    userPhotosAll: string;
    userPhotosEmpty: string;
    userPhotosCount: (n: number) => string;
    archiveAllReels: string;
    archiveTimeline: string;
    archiveCalendar: string;
    archiveSearch: string;
    archiveAll: string;
    archiveEmpty: string;
    archiveBack: string;
    archiveCount: (n: number) => string;
    archiveJumpTo: string;
    archiveWho: string;
    archivePickDay: string;
    backToSite: (name: string) => string;
  };
  featured: {
    pickUp: string;
    viewShop: string;
    viewMap: string;
    setFrom: (price: string) => string;
    hours: string;
    featured: string;
    featuredLead: string;
    minutes: (m: number) => string;
    yen: (price: string) => string;
  };
  feed: {
    noNowPosts: string;
    nowTitle: string;
    noResults: string;
    noEvents: string;
    searchPlaceholder: string;
    resetFilters: string;
  };
  cast: {
    story: string;
    followGateTitle: string;
    followGateSub: string;
    noPosts: string;
    photos: string;
    schedule: string;
    noSchedule: string;
    diary: string;
    noDiary: string;
    dayOff: string;
    untitled: string;
    storyNotFound: string;
    backToShop: (name: string) => string;
    age: (age: number) => string;
  };
  contact: {
    title: string;
    copied: string;
    lineQrAlt: string;
    lineQrHint: string;
    callButton: string;
    callHint: string;
    lineButton: string;
    noContact: string;
    mentionHint: string;
    mentionPhrase: string;
    copied2: string;
  };
  comment: {
    title: string;
    empty: string;
    ngWord: string;
    postFailed: string;
    replyFailed: string;
    deleteFailed: string;
    blockFailed: string;
    you: string;
    fromCast: string;
    delete: string;
    block: string;
    replyPlaceholder: string;
    reply: string;
    disabled: string;
    loginToComment: string;
    commentPlaceholder: string;
    send: string;
    alreadyCommented: string;
    castReplyHint: string;
  };
  ai: {
    assistantName: string;
    triggerLabel: string;
    greeting: string;
    placeholder: string;
    send: string;
    resetTooltip: string;
    escalatedNotice: string;
    startNewConversation: string;
    loginPrompt: string;
    loginOrSignup: string;
    sendError: string;
    genericError: string;
    // 街の声ベータ版(2体目のAI)。管理画面のベータスイッチがオンのときだけタブが出る。
    conciergeTab: string;
    machiTab: string;
    machiName: string;
    machiGreeting: string;
    micStart: string;
    micStop: string;
    micIosHint: string;
    micDenied: string;
    micNoSpeech: string;
    micUnavailable: string;
    disclaimer: string;
  };
  mypage: {
    inquiryHistory: string;
    accountSettings: string;
    logout: string;
    changeAvatar: string;
    editProfile: string;
    following: string;
    favoriteShops: string;
    savedReels: string;
    workingToday: string;
    tabReels: string;
    tabCasts: string;
    tabShops: string;
    tabComments: string;
    tabPhotos: string;
    noPhotos: string;
    noSavedReels: string;
    noFollowedCasts: string;
    noFavoriteShops: string;
    noComments: string;
    workingTodayBadge: string;
    offTodayBadge: string;
    unfollow: string;
    unfavorite: string;
    deleteComment: string;
    open: string;
    closed: string;
    editProfileTitle: string;
    nicknameLabel: string;
    cancel: string;
    save: string;
    saving: string;
    nicknameRequired: string;
    saveFailed: string;
    avatarUploadFailed: string;
    avatarSaveFailed: string;
    unknownError: string;
    back: string;
    passwordTitle: string;
    passwordDesc: string;
    pushTitle: string;
    pushDesc: string;
  };
  error: {
    title: string;
    body: string;
    retry: string;
  };
  notifications: {
    empty: string;
    delete: string;
    deleteAll: string;
    deleteAllConfirm: string;
    deleteFailed: string;
  };
  photo: {
    title: string;
    description: string;
    allAreas: string;
    otherArea: string;
    viewGrid: string;
    viewMap: string;
    viewSpots: string;
    spotsIntro: string;
    spotsSortPopular: string;
    spotsSortNew: string;
    spotsEmpty: string;
    postButton: string;
    empty: string;
    feedIntro: string;
    seeAll: string;
    backToPhotos: string;
    backToGrid: string;
    backToMap: string;
    backToList: string;
    badgeListed: string;
    postingTo: (name: string) => string;
    postingToClear: string;
    badgeSpot: string;
    fullscreen: string;
    close: string;
    prevPhoto: string;
    nextPhoto: string;
    like: string;
    unlike: string;
    directions: string;
    directionsArrow: string;
    viewPhotos: string;
    routeAdd: string;
    routeRemove: string;
    routeStart: string;
    routeClear: string;
    profilePosts: string;
    profileLikes: string;
    profileFollowers: string;
    profileFollowing: string;
    follow: string;
    composeTitle: string;
    choosePhoto: string;
    aiGenerate: string;
    aiThinking: string;
    gpsChecking: string;
    gpsFound: string;
    gpsNone: string;
    gpsFromAddress: string;
    addressPlaceholder: string;
    checkLocation: string;
    nearbyTitle: string;
    spotLabel: string;
    spotPlaceholder: string;
    commentLabel: string;
    commentPlaceholder: string;
    asOperator: string;
    submit: string;
    submitting: string;
    moderationNote: string;
    errTooLarge15: string;
    errGeocode: string;
    errCannotSend: string;
    errPayload: string;
    errNetwork: string;
    errAiFailed: string;
    apiLoginRequired: string;
    apiNoPhoto: string;
    apiBadFormat: string;
    apiBadInput: string;
    apiRateLimit: string;
    apiRejected: string;
    apiUploadFailed: string;
    apiPostFailed: string;
    apiWaitMoment: string;
    apiNotFound: string;
    apiSelfFollow: string;
    count: (n: number) => string;
    moreSpots: (n: number) => string;
    routeLabel: (letter: string) => string;
    memberPhotos: (name: string) => string;
    chooseMedia: string;
    errVideoTooLong: string;
    errVideoTooLarge: string;
    errVideoFormat: string;
    errVideoPoster: string;
    videoNotFound: string;
    videoNote: string;
    gpsNoneVideo: string;
    gpsFoundVideo: string;
    playVideo: string;
    badgeVideo: string;
    videoUploading: (pct: number) => string;
    videoPreparing: string;
    videoChecking: string;
    keepOpen: string;
    videoEta: (sec: number) => string;
    tags: Record<string, string>;
  };
  language: {
    switch: string;
  };
};

const ja: Dictionary = {
  nav: {
    home: "ホーム",
    events: "イベント",
    favorites: "お気に入り",
    notifications: "お知らせ",
    mypage: "マイページ",
    menu: "メニュー",
    now: "営業中の店舗",
    nowShort: "NOW",
    search: "検索",
    map: "マップ",
  },
  map: {
    searchPlaceholder: "住所・エリア名で検索",
    search: "検索",
    searching: "検索中…",
    notFound: "見つかりませんでした。別の住所やエリア名でお試しください。",
    useMyLocation: "現在地へ",
    noVenuesInView: "この範囲に店舗がありません。地図を広げるか、住所で検索してください。",
    zoomIn: "範囲が広すぎます。地図を拡大するか、住所で検索してください。",
    noPreview: "動画なし",
    visitNow: "行き方を見る",
    details: "詳細",
    sameBuilding: (count: number) => `同じビルの他店舗 ${count}件`,
    all: "すべて",
    watchReels: "タップでリール",
    reelsEnd: "このエリアのリールは以上です",
    carTime: (minutes) => `車で約${minutes}分`,
    walkTime: (minutes) => `徒歩約${minutes}分`,
    walkNow: "徒歩ですぐ",
  },
  common: {
    posts: "投稿",
    likes: "いいね",
    follow: "フォロー",
    following: "フォロー中",
    unfollow: "フォロー解除する",
    seeShopPage: "店舗ページを見る",
    openThisPage: "このページを開く",
    close: "閉じる",
    loading: "読み込み中…",
    addToFavorites: "お気に入りに追加",
    favorited: "お気に入り登録済み",
    share: "シェア",
    fullscreen: "全画面",
    loadFailed: "読み込めませんでした",
    learnMore: "詳しく見る",
    linkCopied: "リンクをコピーしました",
    noMedia: "メディアなし",
    unmute: "ミュート解除",
    mute: "ミュート",
  },
  shop: {
    todaySchedule: "本日の出勤",
    todaySubtitle: "今宵あなたをお迎えする、煌めきの女神たち",
    noScheduleToday: "本日の出勤情報はまだありません。",
    allCast: "FACES",
    noCast: "FACESの登録はまだありません。",
    priceList: "料金表",
    eventAnnouncement: "イベント告知",
    usageNotes: "ご利用にあたって",
    officialSite: "公式サイト",
    routeGuide: "Googleマップでルート案内",
    address: "住所",
    phone: "電話番号",
    businessHours: "営業時間",
    priceInfo: "料金目安",
    navSchedule: "出勤",
    navCast: "FACES",
    navPrice: "料金",
    navAccess: "アクセス",
    navContact: "連絡",
    inquiryButton: "来店予約・問い合わせ",
    inquiryModalTitlePrefix: "",
    inquiryModalTitleSuffix: "への問い合わせ",
    inquiryModalHint: "ログイン不要で送信できます。返信はこのページを再度開くと確認できます。",
    inquiryNamePlaceholder: "お名前(任意)",
    inquiryContactPlaceholder: "電話番号・LINE等(任意)",
    inquiryBodyPlaceholder: "ご希望の日時やご質問など",
    inquirySendFailed: "送信に失敗しました。時間をおいて再度お試しください。",
    inquirySending: "送信中...",
    inquirySubmit: "送信する",
    autoTranslated: "店舗情報は自動翻訳です",
    areaNotSet: "エリア未設定",
    genreNotSet: "ジャンル未設定",
    archiveTitle: "ストック",
    userPhotosTitle: "みんなの写真",
    userPhotosAll: "すべて見る →",
    userPhotosEmpty: "まだ写真の投稿がありません",
    userPhotosCount: (n: number) => `${n}枚`,
    archiveAllReels: "すべてのリールを見る →",
    archiveTimeline: "タイムライン",
    archiveCalendar: "カレンダー",
    archiveSearch: "過去動画を検索",
    archiveAll: "すべて",
    archiveEmpty: "この期間の動画はありません",
    archiveBack: "店舗ページに戻る",
    archiveCount: (n: number) => `${n}本`,
    archiveJumpTo: "月へジャンプ",
    archiveWho: "投稿者",
    archivePickDay: "日付を選ぶと動画が出ます",
    backToSite: (name) => `← ${name} に戻る`,
  },
  featured: {
    pickUp: "PICK UP",
    viewShop: "店舗を見る",
    viewMap: "マップで探す",
    setFrom: (price) => `セット ¥${price}〜`,
    hours: "営業時間",
    featured: "FEATURED",
    featuredLead: "LOCAPASSが厳選する、いま注目の提携店舗。",
    minutes: (m) => `(${m}分)`,
    yen: (price) => `¥${price}`,
  },
  feed: {
    noNowPosts: "営業中の店舗の投稿がまだありません。",
    nowTitle: "現在営業中の店舗",
    noResults: "条件に合う投稿・店舗がありません。",
    noEvents: "条件に合うイベントがありません。",
    searchPlaceholder: "エリア・店名で検索(例: 新宿)",
    resetFilters: "絞り込みをリセット",
  },
  cast: {
    story: "フォロー",
    followGateTitle: "のストーリーはフォロワー限定です。",
    followGateSub: "フォローしてね❤️",
    noPosts: "まだ投稿がありません。",
    photos: "写真",
    schedule: "出勤予定",
    noSchedule: "出勤予定の登録はまだありません。",
    diary: "日記",
    noDiary: "日記の投稿はまだありません。",
    dayOff: "お休み",
    untitled: "(無題)",
    storyNotFound: "ストーリーは見つかりませんでした",
    backToShop: (name) => `← ${name} の一覧に戻る`,
    age: (age) => `${age}歳`,
  },
  contact: {
    title: "お店に連絡する",
    copied: "番号をコピーしました",
    lineQrAlt: "店舗LINEのQRコード",
    lineQrHint: "タップで拡大 / 別端末で読み取り",
    callButton: "電話で問い合わせ",
    callHint: "PCでは自動発信されないことがあります。番号タップでコピーできます",
    lineButton: "LINEで問い合わせ",
    noContact: "この店舗の連絡先情報は現在登録されていません。",
    mentionHint: "連絡の際は「LOCAPASSを見た」とお伝えいただくとスムーズです",
    mentionPhrase: "LOCAPASSを見て連絡しました",
    copied2: "コピーしました",
  },
  comment: {
    title: "コメント",
    empty: "まだコメントはありません。",
    ngWord: "この内容は投稿できません。表現を変えてお試しください。",
    postFailed: "送信できませんでした(通信状況をご確認のうえ、もう一度お試しください)",
    replyFailed: "返信できませんでした(通信状況をご確認のうえ、もう一度お試しください)",
    deleteFailed: "削除できませんでした。",
    blockFailed: "ブロックできませんでした。",
    you: "あなた",
    fromCast: "FACESより",
    delete: "削除",
    block: "ブロック",
    replyPlaceholder: "返信する(15文字以内)",
    reply: "返信",
    disabled: "この投稿はコメントを受け付けていません。",
    loginToComment: "会員登録/ログインしてコメントする",
    commentPlaceholder: "コメントする(15文字以内)",
    send: "送信",
    alreadyCommented: "このリールへのコメントは送信済みです(お1人1回までです)。",
    castReplyHint: "客のコメントに1件ずつ返信できます(1件につき1回まで)。",
  },
  ai: {
    assistantName: "LOCAPASSコンシェルジュ",
    triggerLabel: "LOCAPASSコンシェルジュに質問する",
    greeting: "こんにちは！店舗のご紹介や料金についてお気軽にどうぞ。",
    placeholder: "メッセージを入力...",
    send: "送信",
    resetTooltip: "新しい会話を始める",
    escalatedNotice: "この会話は担当者への引き継ぎ待ちのため、AIからの返答はお休みしています。",
    startNewConversation: "新しい会話を始める",
    loginPrompt: "ログインすると、次回からのご相談内容を踏まえてご案内できます。",
    loginOrSignup: "ログイン / 新規登録",
    sendError: "通信エラーが発生しました。時間をおいて再度お試しください。",
    genericError: "申し訳ございません、うまく処理できませんでした。",
    conciergeTab: "コンシェルジュ",
    machiTab: "街の声",
    machiName: "街の声",
    machiGreeting: "こんばんは〜！今夜はどのへんで遊ぶ予定？エリアでも気分でも教えてくれたら、街のうわさ話もこっそり混ぜて案内するね♪",
    micStart: "音声で入力",
    micStop: "音声入力を止める",
    micIosHint: "キーボードのマイクボタンで話してね。",
    micDenied: "マイクが許可されていません。ブラウザの設定でマイクを許可してください。",
    micNoSpeech: "声が聞き取れませんでした。もう一度マイクを押して話してください。",
    micUnavailable: "このブラウザでは音声入力が使えませんでした。キーボードの音声入力をお使いください。",
    disclaimer: "AIによる回答です。不正確な情報を表示することがあります。",
  },
  mypage: {
    inquiryHistory: "問い合わせ履歴",
    accountSettings: "アカウント設定",
    logout: "ログアウト",
    changeAvatar: "アイコン画像を変更",
    editProfile: "プロフィールを編集",
    following: "フォロー中",
    favoriteShops: "お気に入り店舗",
    savedReels: "保存動画",
    workingToday: "本日出勤中の推し",
    tabReels: "保存動画",
    tabCasts: "推しFACES",
    tabShops: "店舗ストック",
    tabComments: "コメント履歴",
    tabPhotos: "投稿写真",
    noPhotos: "まだ写真を投稿していません",
    noSavedReels: "保存した動画はまだありません",
    noFollowedCasts: "フォロー中のFACESはまだいません",
    noFavoriteShops: "保存した店舗はまだありません",
    noComments: "投稿したコメントはまだありません",
    workingTodayBadge: "本日出勤",
    offTodayBadge: "本日お休み",
    unfollow: "フォロー解除",
    unfavorite: "お気に入り解除",
    deleteComment: "コメントを削除",
    open: "営業中",
    closed: "現在休止中",
    editProfileTitle: "プロフィールを編集",
    nicknameLabel: "ニックネーム",
    cancel: "キャンセル",
    save: "保存する",
    saving: "保存中...",
    nicknameRequired: "ニックネームを入力してください",
    saveFailed: "保存に失敗しました",
    avatarUploadFailed: "アイコンのアップロードに失敗しました",
    avatarSaveFailed: "アイコンの保存に失敗しました",
    unknownError: "不明なエラー",
    back: "戻る",
    passwordTitle: "パスワード",
    passwordDesc: "パスワードを設定しておくと、メールが使えないときでもメールアドレスとパスワードでログインできます。",
    pushTitle: "プッシュ通知",
    pushDesc: "フォロー中FACESの出勤や新着投稿などをこの端末に通知します(準備中の機能も含みます)。",
  },
  error: {
    title: "一時的に読み込めませんでした",
    body: "通信状況が不安定な可能性があります。もう一度お試しください。",
    retry: "再読み込み",
  },
  notifications: {
    empty: "まだお知らせはありません。",
    delete: "削除",
    deleteAll: "すべて削除",
    deleteAllConfirm: "すべての通知を削除します。よろしいですか?",
    deleteFailed: "削除できませんでした。もう一度お試しください。",
  },
  photo: {
    title: "みんなのフォト",
    description: "街で撮られたユーザー投稿の写真を、エリアごとに見られます。",
    allAreas: "すべてのエリア",
    otherArea: "その他",
    viewGrid: "グリッド",
    viewMap: "マップ",
    viewSpots: "穴場",
    spotsIntro: "掲載店ではない、みんなが見つけたお気に入りの場所です。",
    spotsSortPopular: "人気順",
    spotsSortNew: "新着順",
    spotsEmpty: "まだ穴場の投稿がありません",
    postButton: "＋ 写真を投稿",
    empty: "まだ投稿がありません。",
    feedIntro: "みんなが投稿した街の写真",
    seeAll: "すべての写真・マップを見る",
    backToPhotos: "みんなのフォト",
    backToGrid: "グリッドに戻る",
    backToMap: "マップに戻る",
    backToList: "写真一覧に戻る",
    badgeListed: "掲載店",
    postingTo: (name: string) => `${name} の写真として投稿します`,
    postingToClear: "解除",
    badgeSpot: "穴場",
    fullscreen: "フルスクリーンで見る",
    close: "閉じる",
    prevPhoto: "前の写真",
    nextPhoto: "次の写真",
    like: "いいね",
    unlike: "いいねを取り消す",
    directions: "ルート案内",
    directionsArrow: "ルート案内 →",
    viewPhotos: "写真を見る",
    routeAdd: "ルートに追加",
    routeRemove: "ルートから外す",
    routeStart: "ルート検索スタート",
    routeClear: "クリア",
    profilePosts: "投稿",
    profileLikes: "いいね",
    profileFollowers: "フォロワー",
    profileFollowing: "フォロー中",
    follow: "フォローする",
    composeTitle: "写真を投稿",
    choosePhoto: "写真を選ぶ",
    aiGenerate: "✨ AIにおまかせ生成",
    aiThinking: "AIが考えています…",
    gpsChecking: "写真の位置情報を確認しています…",
    gpsFound: "写真から位置情報を検出しました。",
    gpsNone: "この写真には位置情報がありません。場所の住所や地名を入力してください。",
    gpsFromAddress: "入力した場所から位置を設定しました。",
    addressPlaceholder: "例: 東京都渋谷区神宮前5-3-12",
    checkLocation: "位置を確認",
    nearbyTitle: "近くの場所から選ぶ",
    spotLabel: "おすすめの場所・店名（必須）",
    spotPlaceholder: "例: 千波湖の桜並木",
    commentLabel: "ひとこと（任意）",
    commentPlaceholder: "どんな場所か、おすすめポイントなど",
    asOperator: "運営として投稿する（表示名: LOCAPASS運営）",
    submit: "投稿する",
    submitting: "投稿しています…",
    moderationNote: "不適切な写真は、AIによる確認で投稿できないことがあります。",
    errTooLarge15: "画像サイズは15MB以下にしてください。",
    errGeocode: "住所から位置を特定できませんでした。別の書き方でお試しください。",
    errCannotSend: "この写真は大きすぎて送れません。JPEG形式で保存し直すか、別の写真でお試しください。",
    errPayload: "写真のサイズが大きすぎます。別の写真でお試しください。",
    errNetwork: "通信に失敗しました。電波の良い場所でもう一度お試しください。(コード network)",
    errAiFailed: "うまく生成できませんでした。手入力でも投稿できます。",
    apiLoginRequired: "ログインが必要です。",
    apiNoPhoto: "写真を選択してください。",
    apiBadFormat: "対応していない画像形式です。",
    apiBadInput: "入力内容をご確認ください。",
    apiRateLimit: "投稿が続いています。少し時間をおいてお試しください。",
    apiRejected: "この写真は投稿できません。",
    apiUploadFailed: "画像のアップロードに失敗しました。",
    apiPostFailed: "投稿に失敗しました。もう一度お試しください。",
    apiWaitMoment: "少し時間をおいてからもう一度お試しください。",
    apiNotFound: "見つかりません。",
    apiSelfFollow: "自分自身はフォローできません。",
    count: (n: number) => `${n}枚`,
    moreSpots: (n: number) => ` ほか${n}か所`,
    routeLabel: (letter: string) => `ルート ${letter}`,
    memberPhotos: (name: string) => `${name}のフォト`,
    chooseMedia: "写真・動画を選ぶ",
    errVideoTooLong: "動画は30秒以内にしてください。",
    errVideoTooLarge: "動画は50MB以下にしてください。",
    errVideoFormat: "対応していない動画形式です(mp4 / mov / webm)。",
    errVideoPoster: "動画の1コマを取り出せませんでした。別の動画でお試しください。",
    videoNotFound: "アップロードした動画が見つかりません。もう一度お試しください。",
    videoNote: "動画は30秒・50MBまで。",
    gpsNoneVideo: "この動画には位置情報がありません。場所の住所や地名を入力してください。",
    gpsFoundVideo: "動画から位置情報を検出しました。",
    playVideo: "動画を再生",
    badgeVideo: "動画",
    videoUploading: (pct: number) => `動画をアップロード中… ${pct}%`,
    videoPreparing: "動画を読み込んでいます…",
    videoChecking: "AIが確認して保存しています…",
    keepOpen: "アップロード中は、この画面を閉じないでください。",
    videoEta: (sec: number) => `残り約${sec}秒`,
    tags: { "グルメ": "グルメ", "カフェ": "カフェ", "自然・風景": "自然・風景", "夜景": "夜景", "歴史・寺社": "歴史・寺社", "公園": "公園", "建築": "建築", "アート": "アート", "買い物": "買い物", "祭り・イベント": "祭り・イベント", "アクティビティ": "アクティビティ", "スパ・温泉": "スパ・温泉" },
  },
  language: {
    switch: "言語",
  },
};

const en: Dictionary = {
  nav: {
    home: "Home",
    events: "Events",
    favorites: "Favorites",
    notifications: "Notifications",
    mypage: "My Page",
    menu: "Menu",
    now: "Open now",
    nowShort: "NOW",
    search: "Search",
    map: "Map",
  },
  map: {
    searchPlaceholder: "Search by address or area",
    search: "Search",
    searching: "Searching…",
    notFound: "No match found. Try another address or area name.",
    useMyLocation: "My location",
    noVenuesInView: "No venues in this area. Zoom out or search an address.",
    zoomIn: "Area too wide. Zoom in or search an address.",
    noPreview: "No video",
    visitNow: "GET DIRECTIONS",
    details: "Details",
    sameBuilding: (count: number) => `${count} more in this building`,
    all: "ALL",
    watchReels: "Tap for reels",
    reelsEnd: "That's all the reels in this area",
    carTime: (minutes) => `${minutes} min by car`,
    walkTime: (minutes) => `${minutes} min walk`,
    walkNow: "Steps away",
  },
  common: {
    posts: "Posts",
    likes: "Likes",
    follow: "Follow",
    following: "Following",
    unfollow: "Unfollow",
    seeShopPage: "View shop page",
    openThisPage: "Open this page",
    close: "Close",
    loading: "Loading…",
    addToFavorites: "Add to Favorites",
    favorited: "Favorited",
    share: "Share",
    fullscreen: "Fullscreen",
    loadFailed: "Failed to load",
    learnMore: "Learn more",
    linkCopied: "Link copied",
    noMedia: "No media",
    unmute: "Unmute",
    mute: "Mute",
  },
  shop: {
    todaySchedule: "Working Today",
    todaySubtitle: "Meet tonight's stars, ready to welcome you",
    noScheduleToday: "No shift information yet for today.",
    allCast: "FACES",
    noCast: "No FACES registered yet.",
    priceList: "Price List",
    eventAnnouncement: "Events",
    usageNotes: "Usage Notes",
    officialSite: "Official Site",
    routeGuide: "Directions on Google Maps",
    address: "Address",
    phone: "Phone",
    businessHours: "Business Hours",
    priceInfo: "Price Range",
    navSchedule: "Shifts",
    navCast: "FACES",
    navPrice: "Price",
    navAccess: "Access",
    navContact: "Contact",
    inquiryButton: "Reservation / Inquiry",
    inquiryModalTitlePrefix: "Contact ",
    inquiryModalTitleSuffix: "",
    inquiryModalHint: "No login required to send. Reopen this page to check for a reply.",
    inquiryNamePlaceholder: "Name (optional)",
    inquiryContactPlaceholder: "Phone, LINE, etc. (optional)",
    inquiryBodyPlaceholder: "Your preferred date/time or any questions",
    inquirySendFailed: "Failed to send. Please try again shortly.",
    inquirySending: "Sending...",
    inquirySubmit: "Send",
    autoTranslated: "Shop details are machine-translated from Japanese.",
    areaNotSet: "Area not set",
    genreNotSet: "Genre not set",
    archiveTitle: "Archive",
    userPhotosTitle: "Photos from visitors",
    userPhotosAll: "See all →",
    userPhotosEmpty: "No photos posted yet",
    userPhotosCount: (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`,
    archiveAllReels: "All reels →",
    archiveTimeline: "Timeline",
    archiveCalendar: "Calendar",
    archiveSearch: "Search past videos",
    archiveAll: "All",
    archiveEmpty: "No videos in this period",
    archiveBack: "Back to shop page",
    archiveCount: (n: number) => `${n} ${n === 1 ? "video" : "videos"}`,
    archiveJumpTo: "Jump to month",
    archiveWho: "Posted by",
    archivePickDay: "Pick a day to see its videos",
    backToSite: (name) => `← Back to ${name}`,
  },
  featured: {
    pickUp: "PICK UP",
    viewShop: "View Shop",
    viewMap: "Explore the Map",
    setFrom: (price) => `From ¥${price}`,
    hours: "Hours",
    featured: "FEATURED",
    featuredLead: "A curated selection of LOCAPASS's partner venues.",
    minutes: (m) => `(${m} min)`,
    yen: (price) => `¥${price}`,
  },
  feed: {
    noNowPosts: "No posts from shops that are open right now.",
    nowTitle: "Shops open now",
    noResults: "No posts or shops match your filters.",
    noEvents: "No events match your filters.",
    searchPlaceholder: "Search by area or shop name (e.g. Shinjuku)",
    resetFilters: "Reset filters",
  },
  cast: {
    story: "Follow",
    followGateTitle: "'s story is for followers only.",
    followGateSub: "Follow to watch ❤️",
    noPosts: "No posts yet.",
    photos: "Photos",
    schedule: "Schedule",
    noSchedule: "No shifts scheduled yet.",
    diary: "Diary",
    noDiary: "No diary entries yet.",
    dayOff: "Off",
    untitled: "(Untitled)",
    storyNotFound: "Story not found",
    backToShop: (name) => `← Back to ${name}`,
    age: (age) => `${age} yrs`,
  },
  contact: {
    title: "Contact the shop",
    copied: "Number copied",
    lineQrAlt: "Shop LINE QR code",
    lineQrHint: "Tap to enlarge / scan on another device",
    callButton: "Call this shop",
    callHint: "Calls may not start automatically on PC. Tap the number to copy it.",
    lineButton: "Contact via LINE",
    noContact: "No contact information is registered for this shop yet.",
    mentionHint: "Please mention that you found the shop on LOCAPASS when you get in touch.",
    mentionPhrase: "I saw this shop on LOCAPASS",
    copied2: "Copied",
  },
  comment: {
    title: "Comments",
    empty: "No comments yet.",
    ngWord: "This content can't be posted. Please rephrase and try again.",
    postFailed: "Failed to send. Please check your connection and try again.",
    replyFailed: "Failed to reply. Please check your connection and try again.",
    deleteFailed: "Failed to delete.",
    blockFailed: "Failed to block.",
    you: "You",
    fromCast: "From FACES",
    delete: "Delete",
    block: "Block",
    replyPlaceholder: "Reply (max 15 chars)",
    reply: "Reply",
    disabled: "This post isn't accepting comments.",
    loginToComment: "Sign up / Log in to comment",
    commentPlaceholder: "Comment (max 15 chars)",
    send: "Send",
    alreadyCommented: "You've already commented on this reel (one per person).",
    castReplyHint: "You can reply to each comment once.",
  },
  ai: {
    assistantName: "LOCAPASS Concierge",
    triggerLabel: "Ask LOCAPASS Concierge",
    greeting: "Hi! Feel free to ask about our shops or pricing.",
    placeholder: "Type a message...",
    send: "Send",
    resetTooltip: "Start a new conversation",
    escalatedNotice: "This conversation is waiting for a staff member, so the AI has paused replying.",
    startNewConversation: "Start a new conversation",
    loginPrompt: "Log in so we can remember your requests next time.",
    loginOrSignup: "Log in / Sign up",
    sendError: "A connection error occurred. Please try again shortly.",
    genericError: "Sorry, something went wrong.",
    conciergeTab: "Concierge",
    machiTab: "Street Voice",
    machiName: "Street Voice",
    machiGreeting: "Hi there! Where are you heading tonight? Tell me an area or your mood, and I'll sneak in a little street gossip too ♪",
    micStart: "Voice input",
    micStop: "Stop voice input",
    micIosHint: "Tap the mic on your keyboard to speak.",
    micDenied: "Microphone access is blocked. Please allow it in your browser settings.",
    micNoSpeech: "We couldn't hear you. Tap the mic and try again.",
    micUnavailable: "Voice input isn't available in this browser. Please use your keyboard's dictation.",
    disclaimer: "AI-generated answers may be inaccurate.",
  },
  mypage: {
    inquiryHistory: "Inquiry History",
    accountSettings: "Account Settings",
    logout: "Log out",
    changeAvatar: "Change avatar",
    editProfile: "Edit Profile",
    following: "Following",
    favoriteShops: "Favorite Shops",
    savedReels: "Saved Reels",
    workingToday: "Favorites working today",
    tabReels: "Saved Reels",
    tabCasts: "Favorite FACES",
    tabShops: "Favorite Shops",
    tabComments: "Comment History",
    tabPhotos: "My Photos",
    noPhotos: "You haven't posted any photos yet",
    noSavedReels: "No saved reels yet.",
    noFollowedCasts: "You're not following any FACES yet.",
    noFavoriteShops: "No favorite shops yet.",
    noComments: "No comments posted yet.",
    workingTodayBadge: "Working today",
    offTodayBadge: "Off today",
    unfollow: "Unfollow",
    unfavorite: "Remove favorite",
    deleteComment: "Delete comment",
    open: "Open",
    closed: "Currently closed",
    editProfileTitle: "Edit Profile",
    nicknameLabel: "Nickname",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    nicknameRequired: "Please enter a nickname",
    saveFailed: "Failed to save",
    avatarUploadFailed: "Failed to upload avatar",
    avatarSaveFailed: "Failed to save avatar",
    unknownError: "Unknown error",
    back: "Back",
    passwordTitle: "Password",
    passwordDesc: "Set a password so you can log in with your email and password even when email isn't available.",
    pushTitle: "Push Notifications",
    pushDesc: "Get notified on this device about shifts and new posts from FACES you follow (including upcoming features).",
  },
  error: {
    title: "Couldn't load this page",
    body: "Your connection may be unstable. Please try again.",
    retry: "Reload",
  },
  notifications: {
    empty: "No notifications yet.",
    delete: "Delete",
    deleteAll: "Delete all",
    deleteAllConfirm: "Delete all notifications?",
    deleteFailed: "Could not delete. Please try again.",
  },
  photo: {
    title: "Community Photos",
    description: "Browse photos shared by locals and visitors, area by area.",
    allAreas: "All areas",
    otherArea: "Other",
    viewGrid: "Grid",
    viewMap: "Map",
    viewSpots: "Hidden gems",
    spotsIntro: "Places our visitors discovered — not listed shops.",
    spotsSortPopular: "Popular",
    spotsSortNew: "Newest",
    spotsEmpty: "No hidden-gem posts yet",
    postButton: "+ Post a photo",
    empty: "No photos yet.",
    feedIntro: "Photos of the area shared by everyone",
    seeAll: "See all photos & map",
    backToPhotos: "Community Photos",
    backToGrid: "Back to grid",
    backToMap: "Back to map",
    backToList: "Back to photo list",
    badgeListed: "Listed",
    postingTo: (name: string) => `Posting as a photo of ${name}`,
    postingToClear: "Clear",
    badgeSpot: "Hidden gem",
    fullscreen: "View fullscreen",
    close: "Close",
    prevPhoto: "Previous photo",
    nextPhoto: "Next photo",
    like: "Like",
    unlike: "Remove like",
    directions: "Directions",
    directionsArrow: "Directions →",
    viewPhotos: "View photos",
    routeAdd: "Add to route",
    routeRemove: "Remove from route",
    routeStart: "Start route search",
    routeClear: "Clear",
    profilePosts: "Posts",
    profileLikes: "Likes",
    profileFollowers: "Followers",
    profileFollowing: "Following",
    follow: "Follow",
    composeTitle: "Post a photo",
    choosePhoto: "Choose a photo",
    aiGenerate: "✨ Let AI write it",
    aiThinking: "AI is thinking…",
    gpsChecking: "Reading the photo's location…",
    gpsFound: "Location detected from the photo.",
    gpsNone: "This photo has no location data. Enter an address or place name.",
    gpsFromAddress: "Location set from the place you entered.",
    addressPlaceholder: "e.g. 5-3-12 Jingumae, Shibuya, Tokyo",
    checkLocation: "Check location",
    nearbyTitle: "Pick a nearby place",
    spotLabel: "Place or shop name (required)",
    spotPlaceholder: "e.g. Cherry blossoms along the lake",
    commentLabel: "A few words (optional)",
    commentPlaceholder: "What's it like? Why do you recommend it?",
    asOperator: "Post as the operator (display name: LOCAPASS運営)",
    submit: "Post",
    submitting: "Posting…",
    moderationNote: "Inappropriate photos may be rejected by our AI check.",
    errTooLarge15: "Please use an image under 15 MB.",
    errGeocode: "Couldn't find that location. Try a different spelling.",
    errCannotSend: "This photo is too large to upload. Save it as JPEG or try another photo.",
    errPayload: "The photo is too large. Please try another one.",
    errNetwork: "Network error. Please try again with a better connection. (code network)",
    errAiFailed: "Couldn't generate that. You can still type it in yourself.",
    apiLoginRequired: "Please log in.",
    apiNoPhoto: "Please choose a photo.",
    apiBadFormat: "Unsupported image format.",
    apiBadInput: "Please check your input.",
    apiRateLimit: "You're posting too fast. Please wait a moment.",
    apiRejected: "This photo can't be posted.",
    apiUploadFailed: "Image upload failed.",
    apiPostFailed: "Posting failed. Please try again.",
    apiWaitMoment: "Please wait a moment and try again.",
    apiNotFound: "Not found.",
    apiSelfFollow: "You can't follow yourself.",
    count: (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`,
    moreSpots: (n: number) => ` +${n} more`,
    routeLabel: (letter: string) => `Route ${letter}`,
    memberPhotos: (name: string) => `${name}'s photos`,
    chooseMedia: "Choose a photo or video",
    errVideoTooLong: "Please use a video of 30 seconds or less.",
    errVideoTooLarge: "Please use a video under 50 MB.",
    errVideoFormat: "Unsupported video format (mp4 / mov / webm).",
    errVideoPoster: "Couldn't read a frame from the video. Please try another one.",
    videoNotFound: "We couldn't find the uploaded video. Please try again.",
    videoNote: "Videos: up to 30 sec / 50 MB.",
    gpsNoneVideo: "This video has no location data. Enter an address or place name.",
    gpsFoundVideo: "Location detected from the video.",
    playVideo: "Play video",
    badgeVideo: "Video",
    videoUploading: (pct: number) => `Uploading video… ${pct}%`,
    videoPreparing: "Reading the video…",
    videoChecking: "AI is checking and saving…",
    keepOpen: "Please keep this screen open while uploading.",
    videoEta: (sec: number) => `About ${sec}s left`,
    tags: { "グルメ": "Food", "カフェ": "Cafe", "自然・風景": "Nature & scenery", "夜景": "Night view", "歴史・寺社": "History & shrines", "公園": "Park", "建築": "Architecture", "アート": "Art", "買い物": "Shopping", "祭り・イベント": "Festivals & events", "アクティビティ": "Activities", "スパ・温泉": "Spa & hot springs" },
  },
  language: {
    switch: "Language",
  },
};

const zh: Dictionary = {
  nav: {
    home: "首页",
    events: "活动",
    favorites: "收藏",
    notifications: "通知",
    mypage: "我的页面",
    menu: "菜单",
    now: "营业中的店铺",
    nowShort: "NOW",
    search: "搜索",
    map: "地图",
  },
  map: {
    searchPlaceholder: "按地址或区域搜索",
    search: "搜索",
    searching: "搜索中…",
    notFound: "未找到。请尝试其他地址或区域名称。",
    useMyLocation: "当前位置",
    noVenuesInView: "此范围内没有店铺。请缩小地图或搜索地址。",
    zoomIn: "范围过大。请放大地图或搜索地址。",
    noPreview: "无视频",
    visitNow: "查看路线",
    details: "详情",
    sameBuilding: (count: number) => `同栋楼其他店铺 ${count} 家`,
    all: "全部",
    watchReels: "点击观看短视频",
    reelsEnd: "此区域的短视频已全部播放",
    carTime: (minutes) => `车程约${minutes}分钟`,
    walkTime: (minutes) => `步行约${minutes}分钟`,
    walkNow: "步行即达",
  },
  common: {
    posts: "帖子",
    likes: "点赞",
    follow: "关注",
    following: "已关注",
    unfollow: "取消关注",
    seeShopPage: "查看店铺页面",
    openThisPage: "打开此页面",
    close: "关闭",
    loading: "加载中…",
    addToFavorites: "加入收藏",
    favorited: "已收藏",
    share: "分享",
    fullscreen: "全屏",
    loadFailed: "加载失败",
    learnMore: "查看详情",
    linkCopied: "链接已复制",
    noMedia: "无媒体内容",
    unmute: "取消静音",
    mute: "静音",
  },
  shop: {
    todaySchedule: "今日出勤",
    todaySubtitle: "今夜迎接您的闪耀女神们",
    noScheduleToday: "今日暂无出勤信息。",
    allCast: "FACES",
    noCast: "暂无FACES信息。",
    priceList: "价目表",
    eventAnnouncement: "活动公告",
    usageNotes: "使用须知",
    officialSite: "官方网站",
    routeGuide: "在Google地图中查看路线",
    address: "地址",
    phone: "电话号码",
    businessHours: "营业时间",
    priceInfo: "价格范围",
    navSchedule: "出勤",
    navCast: "FACES",
    navPrice: "价格",
    navAccess: "交通",
    navContact: "联系",
    inquiryButton: "预约到店・咨询",
    inquiryModalTitlePrefix: "联系",
    inquiryModalTitleSuffix: "",
    inquiryModalHint: "无需登录即可发送。再次打开此页面即可查看回复。",
    inquiryNamePlaceholder: "姓名(选填)",
    inquiryContactPlaceholder: "电话号码・LINE等(选填)",
    inquiryBodyPlaceholder: "希望的日期时间或其他问题",
    inquirySendFailed: "发送失败，请稍后再试。",
    inquirySending: "发送中...",
    inquirySubmit: "发送",
    autoTranslated: "店铺信息由日语自动翻译。",
    areaNotSet: "地区未设置",
    genreNotSet: "类型未设置",
    archiveTitle: "存档",
    userPhotosTitle: "大家的照片",
    userPhotosAll: "查看全部 →",
    userPhotosEmpty: "暂无照片投稿",
    userPhotosCount: (n: number) => `${n}张`,
    archiveAllReels: "查看全部视频 →",
    archiveTimeline: "时间线",
    archiveCalendar: "日历",
    archiveSearch: "搜索往期视频",
    archiveAll: "全部",
    archiveEmpty: "此期间没有视频",
    archiveBack: "返回店铺页面",
    archiveCount: (n: number) => `${n}个`,
    archiveJumpTo: "跳转到月份",
    archiveWho: "发布者",
    archivePickDay: "选择日期查看视频",
    backToSite: (name) => `← 返回${name}`,
  },
  featured: {
    pickUp: "PICK UP",
    viewShop: "查看店铺",
    viewMap: "在地图中探索",
    setFrom: (price) => `套餐 ¥${price}起`,
    hours: "营业时间",
    featured: "FEATURED",
    featuredLead: "LOCAPASS精选的热门合作店铺。",
    minutes: (m) => `(${m}分钟)`,
    yen: (price) => `¥${price}`,
  },
  feed: {
    noNowPosts: "暂无营业中店铺的帖子。",
    nowTitle: "当前营业中的店铺",
    noResults: "没有符合条件的帖子或店铺。",
    noEvents: "没有符合条件的活动。",
    searchPlaceholder: "按地区・店名搜索(例: 新宿)",
    resetFilters: "重置筛选",
  },
  cast: {
    story: "关注",
    followGateTitle: "的动态仅限粉丝查看。",
    followGateSub: "关注后即可观看 ❤️",
    noPosts: "暂无帖子。",
    photos: "照片",
    schedule: "出勤安排",
    noSchedule: "暂无出勤安排。",
    diary: "日记",
    noDiary: "暂无日记。",
    dayOff: "休息",
    untitled: "(无标题)",
    storyNotFound: "未找到该动态",
    backToShop: (name) => `← 返回${name}`,
    age: (age) => `${age}岁`,
  },
  contact: {
    title: "联系店铺",
    copied: "号码已复制",
    lineQrAlt: "店铺LINE二维码",
    lineQrHint: "点击放大 / 在其他设备上扫描",
    callButton: "电话咨询",
    callHint: "在电脑上可能无法自动拨号。点击号码即可复制。",
    lineButton: "通过LINE咨询",
    noContact: "该店铺暂未登记联系方式。",
    mentionHint: "联系时请告知您是通过LOCAPASS看到的，会更顺畅。",
    mentionPhrase: "我在LOCAPASS上看到了这家店",
    copied2: "已复制",
  },
  comment: {
    title: "评论",
    empty: "暂无评论。",
    ngWord: "该内容无法发布，请换一种表达方式后重试。",
    postFailed: "发送失败，请检查网络后重试。",
    replyFailed: "回复失败，请检查网络后重试。",
    deleteFailed: "删除失败。",
    blockFailed: "屏蔽失败。",
    you: "你",
    fromCast: "来自FACES",
    delete: "删除",
    block: "屏蔽",
    replyPlaceholder: "回复(最多15字)",
    reply: "回复",
    disabled: "该帖子未开放评论。",
    loginToComment: "注册/登录后即可评论",
    commentPlaceholder: "评论(最多15字)",
    send: "发送",
    alreadyCommented: "您已评论过此帖子(每人限一次)。",
    castReplyHint: "可对每条评论回复一次。",
  },
  ai: {
    assistantName: "LOCAPASS礼宾",
    triggerLabel: "咨询LOCAPASS礼宾",
    greeting: "您好！欢迎随时咨询店铺介绍或价格。",
    placeholder: "请输入消息...",
    send: "发送",
    resetTooltip: "开始新对话",
    escalatedNotice: "本次对话正在等待工作人员处理，AI暂停自动回复。",
    startNewConversation: "开始新对话",
    loginPrompt: "登录后，下次咨询可参考您之前的对话内容。",
    loginOrSignup: "登录 / 注册",
    sendError: "发生通信错误，请稍后再试。",
    genericError: "抱歉，处理时出现问题。",
    conciergeTab: "礼宾",
    machiTab: "街头之声",
    machiName: "街头之声",
    machiGreeting: "晚上好～！今晚打算去哪儿玩呀？告诉我区域或心情，我会悄悄加点街头小道消息给你哦♪",
    micStart: "语音输入",
    micStop: "停止语音输入",
    micIosHint: "请点击键盘上的麦克风说话。",
    micDenied: "麦克风未获授权，请在浏览器设置中允许。",
    micNoSpeech: "没有听到声音，请再点一次麦克风说话。",
    micUnavailable: "此浏览器无法使用语音输入，请使用键盘的语音输入。",
    disclaimer: "回答由AI生成，可能不准确。",
  },
  mypage: {
    inquiryHistory: "咨询记录",
    accountSettings: "账户设置",
    logout: "退出登录",
    changeAvatar: "更改头像",
    editProfile: "编辑资料",
    following: "关注中",
    favoriteShops: "收藏店铺",
    savedReels: "已保存的帖子",
    workingToday: "今日出勤的关注对象",
    tabReels: "已保存的帖子",
    tabCasts: "关注的FACES",
    tabShops: "收藏的店铺",
    tabComments: "评论记录",
    tabPhotos: "我的照片",
    noPhotos: "还没有投稿照片",
    noSavedReels: "暂无已保存的帖子。",
    noFollowedCasts: "暂未关注任何FACES。",
    noFavoriteShops: "暂无收藏的店铺。",
    noComments: "暂无发布的评论。",
    workingTodayBadge: "今日出勤",
    offTodayBadge: "今日休息",
    unfollow: "取消关注",
    unfavorite: "取消收藏",
    deleteComment: "删除评论",
    open: "营业中",
    closed: "暂停营业",
    editProfileTitle: "编辑资料",
    nicknameLabel: "昵称",
    cancel: "取消",
    save: "保存",
    saving: "保存中...",
    nicknameRequired: "请输入昵称",
    saveFailed: "保存失败",
    avatarUploadFailed: "头像上传失败",
    avatarSaveFailed: "头像保存失败",
    unknownError: "未知错误",
    back: "返回",
    passwordTitle: "密码",
    passwordDesc: "设置密码后，即使无法使用邮箱验证，也能通过邮箱地址和密码登录。",
    pushTitle: "推送通知",
    pushDesc: "将关注FACES的出勤和新帖子等推送到此设备(包含部分开发中的功能)。",
  },
  error: {
    title: "暂时无法加载",
    body: "网络状况可能不稳定，请重试。",
    retry: "重新加载",
  },
  notifications: {
    empty: "暂无通知。",
    delete: "删除",
    deleteAll: "全部删除",
    deleteAllConfirm: "确定删除所有通知吗?",
    deleteFailed: "删除失败,请重试。",
  },
  photo: {
    title: "大家的照片",
    description: "按区域浏览当地人和游客分享的街头照片。",
    allAreas: "所有区域",
    otherArea: "其他",
    viewGrid: "网格",
    viewMap: "地图",
    viewSpots: "秘境好去处",
    spotsIntro: "大家发现的、不在合作名单里的宝藏地点。",
    spotsSortPopular: "人气",
    spotsSortNew: "最新",
    spotsEmpty: "暂无秘境投稿",
    postButton: "＋ 发布照片",
    empty: "还没有投稿。",
    feedIntro: "大家分享的街头照片",
    seeAll: "查看全部照片和地图",
    backToPhotos: "大家的照片",
    backToGrid: "返回网格",
    backToMap: "返回地图",
    backToList: "返回照片列表",
    badgeListed: "合作店铺",
    postingTo: (name: string) => `将作为 ${name} 的照片投稿`,
    postingToClear: "取消",
    badgeSpot: "隐藏好去处",
    fullscreen: "全屏查看",
    close: "关闭",
    prevPhoto: "上一张",
    nextPhoto: "下一张",
    like: "点赞",
    unlike: "取消点赞",
    directions: "路线指引",
    directionsArrow: "路线指引 →",
    viewPhotos: "查看照片",
    routeAdd: "加入路线",
    routeRemove: "从路线移除",
    routeStart: "开始路线搜索",
    routeClear: "清除",
    profilePosts: "投稿",
    profileLikes: "获赞",
    profileFollowers: "粉丝",
    profileFollowing: "关注中",
    follow: "关注",
    composeTitle: "发布照片",
    choosePhoto: "选择照片",
    aiGenerate: "✨ 交给AI生成",
    aiThinking: "AI正在构思…",
    gpsChecking: "正在读取照片位置信息…",
    gpsFound: "已从照片中检测到位置信息。",
    gpsNone: "这张照片没有位置信息，请输入地址或地名。",
    gpsFromAddress: "已根据输入的地点设置位置。",
    addressPlaceholder: "例：东京都涩谷区神宫前5-3-12",
    checkLocation: "确认位置",
    nearbyTitle: "从附近地点中选择",
    spotLabel: "推荐的地点/店名（必填）",
    spotPlaceholder: "例：湖畔的樱花道",
    commentLabel: "一句话（选填）",
    commentPlaceholder: "这是个怎样的地方？有什么推荐理由？",
    asOperator: "以运营身份发布（显示名称：LOCAPASS运营）",
    submit: "发布",
    submitting: "正在发布…",
    moderationNote: "不当照片可能无法通过AI审核而无法发布。",
    errTooLarge15: "请使用15MB以下的图片。",
    errGeocode: "无法根据地址确定位置，请换一种写法试试。",
    errCannotSend: "这张照片太大无法上传。请另存为JPEG格式或换一张照片。",
    errPayload: "照片太大，请换一张试试。",
    errNetwork: "网络连接失败，请在信号良好的地方重试。（代码 network）",
    errAiFailed: "生成失败，也可以手动输入后发布。",
    apiLoginRequired: "请先登录。",
    apiNoPhoto: "请选择照片。",
    apiBadFormat: "不支持的图片格式。",
    apiBadInput: "请检查输入内容。",
    apiRateLimit: "发布过于频繁，请稍后再试。",
    apiRejected: "这张照片无法发布。",
    apiUploadFailed: "图片上传失败。",
    apiPostFailed: "发布失败，请重试。",
    apiWaitMoment: "请稍后再试。",
    apiNotFound: "未找到。",
    apiSelfFollow: "不能关注自己。",
    count: (n: number) => `${n}张`,
    moreSpots: (n: number) => ` 等${n}处`,
    routeLabel: (letter: string) => `路线 ${letter}`,
    memberPhotos: (name: string) => `${name}的照片`,
    chooseMedia: "选择照片或视频",
    errVideoTooLong: "请使用30秒以内的视频。",
    errVideoTooLarge: "请使用50MB以下的视频。",
    errVideoFormat: "不支持的视频格式（mp4 / mov / webm）。",
    errVideoPoster: "无法读取视频画面，请换一个视频试试。",
    videoNotFound: "未找到已上传的视频，请重试。",
    videoNote: "视频最长30秒、50MB以内。",
    gpsNoneVideo: "这个视频没有位置信息，请输入地址或地名。",
    gpsFoundVideo: "已从视频中检测到位置信息。",
    playVideo: "播放视频",
    badgeVideo: "视频",
    videoUploading: (pct: number) => `正在上传视频… ${pct}%`,
    videoPreparing: "正在读取视频…",
    videoChecking: "AI正在审核并保存…",
    keepOpen: "上传期间请不要关闭此页面。",
    videoEta: (sec: number) => `约剩余${sec}秒`,
    tags: { "グルメ": "美食", "カフェ": "咖啡馆", "自然・風景": "自然风光", "夜景": "夜景", "歴史・寺社": "历史·寺社", "公園": "公园", "建築": "建筑", "アート": "艺术", "買い物": "购物", "祭り・イベント": "祭典·活动", "アクティビティ": "体验活动", "スパ・温泉": "水疗·温泉" },
  },
  language: {
    switch: "语言",
  },
};

// アラビア語(右から左に読む言語。表示は layout.tsx で dir="rtl" にして反転する)。en/jaの辞書をGeminiで機械翻訳したもの。
const ar: Dictionary = {
  "nav": {
    "home": "الرئيسية",
    "events": "الفعاليات",
    "favorites": "المفضلة",
    "notifications": "الإشعارات",
    "mypage": "صفحتي",
    "menu": "القائمة",
    "now": "المتاجر المفتوحة الآن",
    "nowShort": "NOW",
    "search": "بحث",
    "map": "الخريطة"
  },
  "map": {
    "sameBuilding": (count: number) => `${count} متاجر أخرى في نفس المبنى`,
    "carTime": (minutes: number) => `حوالي ${minutes} دقيقة بالسيارة`,
    "walkTime": (minutes: number) => `حوالي ${minutes} دقيقة سيرًا على الأقدام`,
    "searchPlaceholder": "البحث حسب العنوان أو المنطقة",
    "search": "بحث",
    "searching": "جاري البحث…",
    "notFound": "لم يتم العثور على نتائج. جرب عنوانًا أو اسم منطقة آخر.",
    "useMyLocation": "موقعي الحالي",
    "noVenuesInView": "لا توجد أماكن في هذه المنطقة. قم بتصغير الخريطة أو ابحث عن عنوان.",
    "zoomIn": "المنطقة واسعة جدًا. قم بتكبير الخريطة أو ابحث عن عنوان.",
    "noPreview": "لا يوجد فيديو",
    "visitNow": "الحصول على الاتجاهات",
    "details": "التفاصيل",
    "all": "الكل",
    "watchReels": "اضغط لمشاهدة المقاطع القصيرة",
    "reelsEnd": "هذه جميع المقاطع القصيرة في هذه المنطقة",
    "walkNow": "على بعد خطوات قليلة"
  },
  "common": {
    "posts": "المنشورات",
    "likes": "الإعجابات",
    "follow": "متابعة",
    "following": "مُتابع",
    "unfollow": "إلغاء المتابعة",
    "seeShopPage": "عرض صفحة المتجر",
    "openThisPage": "فتح هذه الصفحة",
    "close": "إغلاق",
    "loading": "جاري التحميل…",
    "addToFavorites": "إضافة إلى المفضلة",
    "favorited": "مضاف للمفضلة",
    "share": "مشاركة",
    "fullscreen": "ملء الشاشة",
    "loadFailed": "تعذر التحميل",
    "learnMore": "معرفة المزيد",
    "linkCopied": "تم نسخ الرابط",
    "noMedia": "لا توجد وسائط",
    "unmute": "إلغاء الكتم",
    "mute": "كتم الصوت"
  },
  "shop": {
    "backToSite": (name: string) => `← العودة إلى ${name}`,
    "todaySchedule": "متواجدون اليوم",
    "todaySubtitle": "تعرف على نجمات الليلة، الجاهزات للترحيب بك",
    "noScheduleToday": "لا توجد معلومات عن نوبات العمل لهذا اليوم بعد.",
    "allCast": "FACES",
    "noCast": "لا يوجد FACES مسجلون بعد.",
    "priceList": "قائمة الأسعار",
    "eventAnnouncement": "الفعاليات",
    "usageNotes": "ملاحظات الاستخدام",
    "officialSite": "الموقع الرسمي",
    "routeGuide": "الاتجاهات على خرائط Google",
    "address": "العنوان",
    "phone": "رقم الهاتف",
    "businessHours": "ساعات العمل",
    "priceInfo": "متوسط الأسعار",
    "navSchedule": "نوبات العمل",
    "navCast": "FACES",
    "navPrice": "السعر",
    "navAccess": "الوصول",
    "navContact": "التواصل",
    "inquiryButton": "الحجز / الاستفسار",
    "inquiryModalTitlePrefix": "التواصل ",
    "inquiryModalTitleSuffix": "استفسار بشأن ",
    "inquiryModalHint": "لا يلزم تسجيل الدخول للإرسال. أعد فتح هذه الصفحة للتحقق من الرد.",
    "inquiryNamePlaceholder": "الاسم (اختياري)",
    "inquiryContactPlaceholder": "رقم الهاتف، LINE، إلخ (اختياري)",
    "inquiryBodyPlaceholder": "التاريخ/الوقت المفضل لديك أو أي أسئلة",
    "inquirySendFailed": "فشل الإرسال. يرجى المحاولة مرة أخرى بعد قليل.",
    "inquirySending": "جاري الإرسال...",
    "inquirySubmit": "إرسال",
    "autoTranslated": "تفاصيل المتجر مترجمة آليًا من اليابانية.",
    "areaNotSet": "المنطقة غير محددة",
    "genreNotSet": "الفئة غير محددة",
    "archiveTitle": "الأرشيف",
    "userPhotosTitle": "صور الزوار",
    "userPhotosAll": "عرض الكل ←",
    "userPhotosEmpty": "لا توجد صور بعد",
    "userPhotosCount": (n: number) => `${n}`,
    "archiveAllReels": "كل الريلز ←",
    "archiveTimeline": "الجدول الزمني",
    "archiveCalendar": "التقويم",
    "archiveSearch": "ابحث في الفيديوهات السابقة",
    "archiveAll": "الكل",
    "archiveEmpty": "لا توجد فيديوهات في هذه الفترة",
    "archiveBack": "العودة إلى صفحة المتجر",
    "archiveCount": (n: number) => `${n}`,
    "archiveJumpTo": "الانتقال إلى شهر",
    "archiveWho": "الناشر",
    "archivePickDay": "اختر يومًا لعرض فيديوهاته",
  },
  "featured": {
    "setFrom": (price: string) => `ابتداءً من ¥${price}`,
    "minutes": (m: number) => `(${m} دقيقة)`,
    "yen": (price: string) => `¥${price}`,
    "pickUp": "مختارات",
    "viewShop": "عرض المتجر",
    "viewMap": "استكشف الخريطة",
    "hours": "ساعات العمل",
    "featured": "مميز",
    "featuredLead": "تشكيلة مختارة بعناية من الأماكن الشريكة لـ LOCAPASS."
  },
  "feed": {
    "noNowPosts": "لا توجد منشورات من المتاجر المفتوحة حاليًا.",
    "nowTitle": "المتاجر المفتوحة الآن",
    "noResults": "لا توجد منشورات أو متاجر تطابق معايير التصفية.",
    "noEvents": "لا توجد فعاليات تطابق معايير التصفية.",
    "searchPlaceholder": "البحث حسب المنطقة أو اسم المتجر (مثال: Shinjuku)",
    "resetFilters": "إعادة ضبط التصفية"
  },
  "cast": {
    "backToShop": (name: string) => `← العودة إلى ${name}`,
    "age": (age: number) => `${age} سنة`,
    "story": "متابعة",
    "followGateTitle": "القصة مخصصة للمتابعين فقط.",
    "followGateSub": "تابع للمشاهدة ❤️",
    "noPosts": "لا توجد منشورات بعد.",
    "photos": "صور",
    "schedule": "جدول التواجد",
    "noSchedule": "لا يوجد جدول تواجد مسجل بعد.",
    "diary": "يوميات",
    "noDiary": "لا توجد منشورات في اليوميات بعد.",
    "dayOff": "عطلة",
    "untitled": "(بدون عنوان)",
    "storyNotFound": "لم يتم العثور على القصة"
  },
  "contact": {
    "title": "التواصل مع المتجر",
    "copied": "تم نسخ الرقم",
    "lineQrAlt": "رمز QR لـ LINE الخاص بالمتجر",
    "lineQrHint": "اضغط للتكبير / للمسح عبر جهاز آخر",
    "callButton": "الاتصال بالمتجر",
    "callHint": "قد لا تبدأ المكالمات تلقائيًا على أجهزة الكمبيوتر. اضغط على الرقم لنسخه.",
    "lineButton": "التواصل عبر LINE",
    "noContact": "لا تتوفر معلومات تواصل مسجلة لهذا المتجر حاليًا.",
    "mentionHint": "يرجى ذكر أنك وجدت المتجر على LOCAPASS عند التواصل.",
    "mentionPhrase": "رأيت هذا المتجر على LOCAPASS",
    "copied2": "تم النسخ"
  },
  "comment": {
    "title": "التعليقات",
    "empty": "لا توجد تعليقات بعد.",
    "ngWord": "لا يمكن نشر هذا المحتوى. يرجى إعادة الصياغة والمحاولة مرة أخرى.",
    "postFailed": "تعذر الإرسال. يرجى التحقق من الاتصال والمحاولة مرة أخرى.",
    "replyFailed": "تعذر الرد. يرجى التحقق من الاتصال والمحاولة مرة أخرى.",
    "deleteFailed": "تعذر الحذف.",
    "blockFailed": "تعذر الحظر.",
    "you": "أنت",
    "fromCast": "من FACES",
    "delete": "حذف",
    "block": "حظر",
    "replyPlaceholder": "رد (15 حرفًا كحد أقصى)",
    "reply": "رد",
    "disabled": "هذا المنشور لا يقبل التعليقات.",
    "loginToComment": "إنشاء حساب / تسجيل الدخول للتعليق",
    "commentPlaceholder": "إضافة تعليق (15 حرفًا كحد أقصى)",
    "send": "إرسال",
    "alreadyCommented": "لقد أضفت تعليقًا على هذا المقطع مسبقًا (تعليق واحد لكل شخص).",
    "castReplyHint": "يمكنك الرد على كل تعليق مرة واحدة فقط."
  },
  "ai": {
    "assistantName": "كونسيرج LOCAPASS",
    "triggerLabel": "طرح سؤال على كونسيرج LOCAPASS",
    "greeting": "مرحبًا! لا تتردد في الاستفسار عن متاجرنا أو الأسعار.",
    "placeholder": "اكتب رسالة...",
    "send": "إرسال",
    "resetTooltip": "بدء محادثة جديدة",
    "escalatedNotice": "هذه المحادثة بانتظار أحد الموظفين، لذا توقف الذكاء الاصطناعي عن الرد مؤقتًا.",
    "startNewConversation": "بدء محادثة جديدة",
    "loginPrompt": "سجّل الدخول لنتمكن من تذكر طلباتك في المرة القادمة.",
    "loginOrSignup": "تسجيل الدخول / إنشاء حساب",
    "sendError": "حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى بعد قليل.",
    "genericError": "عذرًا، حدث خطأ ما.",
    conciergeTab: "الكونسيرج",
    machiTab: "صوت الشارع",
    machiName: "صوت الشارع",
    machiGreeting: "مساء الخير! وين ناوي تسهر الليلة؟ قلّي المنطقة أو مزاجك، وبهمس لك بشوية أخبار من الشارع ♪",
    micStart: "الإدخال الصوتي",
    micStop: "إيقاف الإدخال الصوتي",
    micIosHint: "اضغط على زر الميكروفون في لوحة المفاتيح وتحدث.",
    micDenied: "الوصول إلى الميكروفون محظور. يرجى السماح به من إعدادات المتصفح.",
    micNoSpeech: "لم نتمكن من سماعك. اضغط على الميكروفون وحاول مرة أخرى.",
    micUnavailable: "الإدخال الصوتي غير متاح في هذا المتصفح. استخدم الإملاء في لوحة المفاتيح.",
    disclaimer: "إجابات الذكاء الاصطناعي قد تكون غير دقيقة."
  },
  "mypage": {
    "inquiryHistory": "سجل الاستفسارات",
    "accountSettings": "إعدادات الحساب",
    "logout": "تسجيل الخروج",
    "changeAvatar": "تغيير الصورة الشخصية",
    "editProfile": "تعديل الملف الشخصي",
    "following": "المتابَعون",
    "favoriteShops": "المتاجر المفضلة",
    "savedReels": "المقاطع المحفوظة",
    "workingToday": "المفضلون يعملون اليوم",
    "tabReels": "المقاطع المحفوظة",
    "tabCasts": "FACES المفضلون",
    "tabShops": "المتاجر المفضلة",
    "tabComments": "سجل التعليقات",
    "tabPhotos": "صوري",
    "noPhotos": "لم تنشر أي صور بعد",
    "noSavedReels": "لا توجد مقاطع محفوظة بعد.",
    "noFollowedCasts": "أنت لا تتابع أيًا من FACES بعد.",
    "noFavoriteShops": "لا توجد متاجر مفضلة بعد.",
    "noComments": "لا توجد تعليقات مضافة بعد.",
    "workingTodayBadge": "يعمل اليوم",
    "offTodayBadge": "في إجازة اليوم",
    "unfollow": "إلغاء المتابعة",
    "unfavorite": "إزالة من المفضلة",
    "deleteComment": "حذف التعليق",
    "open": "مفتوح",
    "closed": "مغلق حاليًا",
    "editProfileTitle": "تعديل الملف الشخصي",
    "nicknameLabel": "الاسم المستعار",
    "cancel": "إلغاء",
    "save": "حفظ",
    "saving": "جاري الحفظ...",
    "nicknameRequired": "يرجى إدخال اسم مستعار",
    "saveFailed": "فشل الحفظ",
    "avatarUploadFailed": "فشل تحميل الصورة الشخصية",
    "avatarSaveFailed": "فشل حفظ الصورة الشخصية",
    "unknownError": "خطأ غير معروف",
    "back": "رجوع",
    "passwordTitle": "كلمة المرور",
    "passwordDesc": "قم بضبط كلمة مرور حتى تتمكن من تسجيل الدخول ببريدك الإلكتروني وكلمة المرور حتى عند عدم توفر البريد الإلكتروني.",
    "pushTitle": "الإشعارات اللحظية",
    "pushDesc": "تلقَّ إشعارات على هذا الجهاز حول نوبات العمل والمشاركات الجديدة من FACES الذين تتابعهم (بما في ذلك الميزات القادمة)."
  },
  "error": {
    "title": "تعذر تحميل هذه الصفحة",
    "body": "قد يكون اتصالك غير مستقر. يرجى المحاولة مرة أخرى.",
    "retry": "إعادة التحميل"
  },
  "notifications": {
    "empty": "لا توجد إشعارات بعد.",
    "delete": "حذف",
    "deleteAll": "حذف الكل",
    "deleteAllConfirm": "هل تريد حذف جميع الإشعارات؟",
    "deleteFailed": "تعذر الحذف. يرجى المحاولة مرة أخرى."
  },
  photo: {
    title: "صور المجتمع",
    description: "تصفّح الصور التي شاركها السكان والزوار حسب المنطقة.",
    allAreas: "كل المناطق",
    otherArea: "أخرى",
    viewGrid: "شبكة",
    viewMap: "الخريطة",
    viewSpots: "أماكن خفية",
    spotsIntro: "أماكن اكتشفها الزوار وليست متاجر مُدرجة.",
    spotsSortPopular: "الأكثر شعبية",
    spotsSortNew: "الأحدث",
    spotsEmpty: "لا توجد منشورات بعد",
    postButton: "＋ انشر صورة",
    empty: "لا توجد صور بعد.",
    feedIntro: "صور المدينة التي شاركها الجميع",
    seeAll: "عرض كل الصور والخريطة",
    backToPhotos: "صور المجتمع",
    backToGrid: "العودة إلى الشبكة",
    backToMap: "العودة إلى الخريطة",
    backToList: "العودة إلى قائمة الصور",
    badgeListed: "متجر مُدرج",
    postingTo: (name: string) => `النشر كصورة من ${name}`,
    postingToClear: "إلغاء",
    badgeSpot: "جوهرة مخفية",
    fullscreen: "عرض بملء الشاشة",
    close: "إغلاق",
    prevPhoto: "الصورة السابقة",
    nextPhoto: "الصورة التالية",
    like: "إعجاب",
    unlike: "إلغاء الإعجاب",
    directions: "الاتجاهات",
    directionsArrow: "الاتجاهات ←",
    viewPhotos: "عرض الصور",
    routeAdd: "أضف إلى المسار",
    routeRemove: "إزالة من المسار",
    routeStart: "ابدأ البحث عن المسار",
    routeClear: "مسح",
    profilePosts: "المنشورات",
    profileLikes: "الإعجابات",
    profileFollowers: "المتابعون",
    profileFollowing: "المتابَعون",
    follow: "متابعة",
    composeTitle: "انشر صورة",
    choosePhoto: "اختر صورة",
    aiGenerate: "✨ دع الذكاء الاصطناعي يكتب",
    aiThinking: "الذكاء الاصطناعي يفكر…",
    gpsChecking: "جارٍ قراءة موقع الصورة…",
    gpsFound: "تم اكتشاف الموقع من الصورة.",
    gpsNone: "لا تحتوي هذه الصورة على بيانات موقع. أدخل عنوانًا أو اسم مكان.",
    gpsFromAddress: "تم تحديد الموقع من المكان الذي أدخلته.",
    addressPlaceholder: "مثال: 5-3-12 Jingumae, Shibuya, Tokyo",
    checkLocation: "تحقق من الموقع",
    nearbyTitle: "اختر مكانًا قريبًا",
    spotLabel: "اسم المكان أو المتجر (مطلوب)",
    spotPlaceholder: "مثال: أشجار الكرز بجانب البحيرة",
    commentLabel: "كلمة موجزة (اختياري)",
    commentPlaceholder: "كيف هو المكان؟ ولماذا تنصح به؟",
    asOperator: "النشر باسم المشغّل (الاسم المعروض: LOCAPASS运营)",
    submit: "نشر",
    submitting: "جارٍ النشر…",
    moderationNote: "قد يتم رفض الصور غير المناسبة بواسطة فحص الذكاء الاصطناعي.",
    errTooLarge15: "يرجى استخدام صورة أقل من 15 ميغابايت.",
    errGeocode: "تعذّر تحديد الموقع من العنوان. جرّب صياغة أخرى.",
    errCannotSend: "هذه الصورة كبيرة جدًا للرفع. احفظها بصيغة JPEG أو جرّب صورة أخرى.",
    errPayload: "الصورة كبيرة جدًا. يرجى تجربة صورة أخرى.",
    errNetwork: "فشل الاتصال. يرجى المحاولة مرة أخرى باتصال أفضل. (الرمز network)",
    errAiFailed: "تعذّر التوليد. يمكنك الكتابة يدويًا والنشر.",
    apiLoginRequired: "يرجى تسجيل الدخول.",
    apiNoPhoto: "يرجى اختيار صورة.",
    apiBadFormat: "صيغة الصورة غير مدعومة.",
    apiBadInput: "يرجى التحقق من المدخلات.",
    apiRateLimit: "تنشر بسرعة كبيرة. يرجى الانتظار قليلًا.",
    apiRejected: "لا يمكن نشر هذه الصورة.",
    apiUploadFailed: "فشل رفع الصورة.",
    apiPostFailed: "فشل النشر. يرجى المحاولة مرة أخرى.",
    apiWaitMoment: "يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.",
    apiNotFound: "غير موجود.",
    apiSelfFollow: "لا يمكنك متابعة نفسك.",
    count: (n: number) => `${n} صورة`,
    moreSpots: (n: number) => ` +${n} أخرى`,
    routeLabel: (letter: string) => `المسار ${letter}`,
    memberPhotos: (name: string) => `صور ${name}`,
    chooseMedia: "اختر صورة أو فيديو",
    errVideoTooLong: "يرجى استخدام فيديو مدته 30 ثانية أو أقل.",
    errVideoTooLarge: "يرجى استخدام فيديو أقل من 50 ميغابايت.",
    errVideoFormat: "صيغة الفيديو غير مدعومة (mp4 / mov / webm).",
    errVideoPoster: "تعذّر قراءة لقطة من الفيديو. جرّب فيديو آخر.",
    videoNotFound: "لم نجد الفيديو المرفوع. يرجى المحاولة مرة أخرى.",
    videoNote: "الفيديو: حتى 30 ثانية و50 ميغابايت.",
    gpsNoneVideo: "لا يحتوي هذا الفيديو على بيانات موقع. أدخل عنوانًا أو اسم مكان.",
    gpsFoundVideo: "تم اكتشاف الموقع من الفيديو.",
    playVideo: "تشغيل الفيديو",
    badgeVideo: "فيديو",
    videoUploading: (pct: number) => `جارٍ رفع الفيديو… ${pct}%`,
    videoPreparing: "جارٍ قراءة الفيديو…",
    videoChecking: "الذكاء الاصطناعي يفحص ويحفظ…",
    keepOpen: "يرجى إبقاء هذه الشاشة مفتوحة أثناء الرفع.",
    videoEta: (sec: number) => `المتبقي حوالي ${sec} ثانية`,
    tags: { "グルメ": "طعام", "カフェ": "مقهى", "自然・風景": "طبيعة ومناظر", "夜景": "منظر ليلي", "歴史・寺社": "تاريخ ومعابد", "公園": "حديقة", "建築": "عمارة", "アート": "فن", "買い物": "تسوق", "祭り・イベント": "مهرجانات وفعاليات", "アクティビティ": "أنشطة", "スパ・温泉": "سبا وينابيع ساخنة" },
  },
  "language": {
    "switch": "اللغة"
  }
};

export const dictionaries: Record<Locale, Dictionary> = { ja, en, zh, ar };
