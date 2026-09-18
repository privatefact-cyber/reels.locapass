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
  };
  notifications: {
    empty: string;
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
    now: "今稼働中のキャスト",
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
    allCast: "在籍キャスト",
    noCast: "在籍キャストの登録はまだありません。",
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
    navCast: "キャスト",
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
    noNowPosts: "今稼働中のキャストの投稿がまだありません。",
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
    fromCast: "キャストより",
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
    tabCasts: "推しキャスト",
    tabShops: "店舗ストック",
    tabComments: "コメント履歴",
    noSavedReels: "保存した動画はまだありません",
    noFollowedCasts: "フォロー中のキャストはまだいません",
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
  },
  notifications: {
    empty: "まだお知らせはありません。",
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
    now: "Cast working now",
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
    allCast: "All Cast",
    noCast: "No cast registered yet.",
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
    navCast: "Cast",
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
    noNowPosts: "No posts from cast currently working.",
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
    fromCast: "From cast",
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
    tabCasts: "Favorite Cast",
    tabShops: "Favorite Shops",
    tabComments: "Comment History",
    noSavedReels: "No saved reels yet.",
    noFollowedCasts: "You're not following any cast yet.",
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
  },
  notifications: {
    empty: "No notifications yet.",
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
    now: "当前出勤",
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
    allCast: "在籍成员",
    noCast: "暂无在籍成员信息。",
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
    navCast: "成员",
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
    noNowPosts: "暂无当前出勤成员的帖子。",
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
    fromCast: "来自成员",
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
    tabCasts: "关注的成员",
    tabShops: "收藏的店铺",
    tabComments: "评论记录",
    noSavedReels: "暂无已保存的帖子。",
    noFollowedCasts: "暂未关注任何成员。",
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
  },
  notifications: {
    empty: "暂无通知。",
  },
  language: {
    switch: "语言",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { ja, en, zh };
