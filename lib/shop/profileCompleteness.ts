import { AFTER_GENRE } from "@/lib/shop/genres";

/**
 * 店舗ページの「掲載の充実度」。店舗ダッシュボードで足りない項目を見せて入力を促す。
 * 重みは「お客さんが店を選ぶときに効く順」。写真・料金・リールを重く、連絡先などは軽くしている。
 */

export type CompletenessItem = {
  key: string;
  label: string;
  hint: string;
  weight: number;
  done: boolean;
  /** 入力場所(ダッシュボード内のアンカー、または別ページ)。 */
  href: string;
};

export type CompletenessInput = {
  genre: string | null;
  coverImageUrl: string | null;
  heroMediaUrl: string | null;
  description: string | null;
  businessHours: string | null;
  phone: string | null;
  lineUrl: string | null;
  address: string | null;
  lat: number | null;
  priceItemCount: number;
  castCount: number;
  reelCount: number;
};

export function computeProfileCompleteness(input: CompletenessInput): {
  percent: number;
  items: CompletenessItem[];
} {
  // アフター(深夜飲食店)はキャストが居ない業態なので、キャスト登録は評価に含めない。
  const hasCast = input.genre !== AFTER_GENRE;

  const items: CompletenessItem[] = [
    {
      key: "cover",
      label: "メイン画像",
      hint: "一覧やマップのカードに出る写真です。無いと黒い仮画像になります。",
      weight: 15,
      done: !!input.coverImageUrl,
      href: "#shop-images",
    },
    {
      key: "hero",
      label: "トップ画像/動画",
      hint: "店舗ページの一番上とマップのカードに出ます。",
      weight: 10,
      done: !!input.heroMediaUrl,
      href: "#shop-images",
    },
    {
      key: "price",
      label: "料金表",
      hint: "お客さんが一番気にする項目です。1件からでも載せましょう。",
      weight: 15,
      done: input.priceItemCount > 0,
      href: "#shop-price",
    },
    {
      key: "reels",
      label: "リール投稿",
      hint: "店内の雰囲気が伝わる短い動画を1本投稿しましょう。",
      weight: 15,
      done: input.reelCount > 0,
      href: "/dashboard/reels",
    },
    {
      key: "description",
      label: "お店紹介文",
      hint: "英語・中国語にも自動翻訳されて海外のお客さんに届きます。",
      weight: 10,
      done: !!input.description?.trim(),
      href: "#shop-basic",
    },
    {
      key: "hours",
      label: "営業時間",
      hint: "例: 18:00〜翌5:00／日曜定休",
      weight: 10,
      done: !!input.businessHours?.trim(),
      href: "#shop-basic",
    },
    {
      key: "pin",
      label: "住所とマップの位置",
      hint: "マップ検索と「行き方を見る」に使われます。",
      weight: 10,
      done: !!input.address?.trim() && input.lat !== null,
      href: "#shop-pin",
    },
    {
      key: "contact",
      label: "電話番号またはLINE",
      hint: "店舗ページの「連絡」ボタンに出ます。",
      weight: 5,
      done: !!input.phone?.trim() || !!input.lineUrl?.trim(),
      href: "#shop-basic",
    },
    ...(hasCast
      ? [
          {
            key: "cast",
            label: "パートナー登録",
            hint: "パートナーと本日の出勤が店舗ページに出るようになります。",
            weight: 10,
            done: input.castCount > 0,
            href: "/dashboard/cast",
          },
        ]
      : []),
  ];

  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const achieved = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  return { percent: total ? Math.round((achieved / total) * 100) : 0, items };
}
