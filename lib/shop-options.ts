/** 店舗オプションの定義。運営の画面・店舗の画面・機能の制限は、すべてこの一覧から作る。オン/オフの実体は locapass_shops の column。 */
export type ShopOptionKey = "embed" | "map_video" | "auto_video";

export type ShopOptionDef = {
  key: ShopOptionKey;
  label: string;
  description: string;
  /** locapass_shops 側の、オン/オフを持つ列。 */
  column: "embed_enabled" | "map_video_enabled" | "auto_video_enabled";
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
    description: "YouTubeなどで店舗が紹介された動画を、毎日自動で見つけて、お店のリールとして追加します。店舗詳細が自然に育っていきます。不要な動画は、投稿画面から非表示にできます。",
    column: "auto_video_enabled",
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
