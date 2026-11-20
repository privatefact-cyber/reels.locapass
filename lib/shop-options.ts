/** 店舗オプションの定義。運営の画面・店舗の画面・機能の制限は、すべてこの一覧から作る。オン/オフの実体は locapass_shops の column。 */
export type ShopOptionKey = "embed" | "map_video" | "auto_video" | "ai_chat" | "ad";

export type ShopOptionDef = {
  key: ShopOptionKey;
  label: string;
  description: string;
  /** locapass_shops 側の、オン/オフを持つ列。 */
  column: "embed_enabled" | "map_video_enabled" | "auto_video_enabled" | "ai_chat_enabled" | "ad_option_enabled";
};

export const SHOP_OPTIONS: ShopOptionDef[] = [
  {
    key: "embed",
    label: "外部動画の追加",
    description: "YouTubeショート・TikTok・Instagramリールのリンクを、リールやイベントの1枚として追加できます。タップするとサイトの中で再生されます。",
    column: "embed_enabled",
  },
  {
    key: "map_video",
    label: "マップのカード動画",
    description: "マップの店舗カードで、動画リールが流れます(オンにしない場合は、店舗のトップ画像が表示されます)。",
    column: "map_video_enabled",
  },
  {
    key: "auto_video",
    label: "動画の自動追加",
    description: "お店のYouTubeチャンネルを登録すると、新しい動画(ショート)が自動でお店のリールに追加されます。本数の上限はありません。不要な動画は、投稿画面から非表示にできます。",
    column: "auto_video_enabled",
  },
  {
    key: "ai_chat",
    label: "店舗AI質問",
    description: "マップのカードと店舗ページに、この店舗の登録情報だけで答えるAIの質問欄が出ます(ネットの情報は使いません)。営業時間・料金・今日のFACESなどを、お客様がその場で聞けます。質問の内容は、管理画面で見られます。",
    column: "ai_chat_enabled",
  },
  {
    key: "ad",
    label: "広告カード(ADオプション)",
    description: "通常版以上の店舗が、自分の広告カード(最大3枚)を、同じエリアの無料掲載の店舗ページに出せます。登録したカードはすぐに配信され(運営が不適切と判断したときは止めます)、表示回数・タップ数は管理画面で見られます。",
    column: "ad_option_enabled",
  },
];

export function optionDef(key: string): ShopOptionDef | undefined {
  return SHOP_OPTIONS.find((o) => o.key === key);
}

export type ShopOptionState = {
  key: ShopOptionKey;
  label: string;
  description: string;
  enabled: boolean;
};

export const OPTION_COLUMNS = SHOP_OPTIONS.map((o) => o.column).join(", ");

/** shops の1行(OPTION_COLUMNS を select したもの)から、オプションごとのオン/オフを作る。 */
export function statesFromRow(row: Record<string, unknown> | null | undefined): ShopOptionState[] {
  return SHOP_OPTIONS.map((o) => ({ key: o.key, label: o.label, description: o.description, enabled: Boolean(row?.[o.column]) }));
}

/** 有料プラン(free以外)に含まれるオプション。契約の有無に関わらず使える(店舗側の権限判定と、一覧の表示で共通)。 */
export const OPTIONS_INCLUDED_IN_PAID_PLAN: readonly ShopOptionKey[] = ["embed"];
