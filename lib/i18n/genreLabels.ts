import type { Locale } from "./locale";

// SHOP_GENRES(lib/shop/genres.ts)の値はDBのCHECK制約と一致させる必要があるため
// 日本語の正規値のまま(フィルタリングのマッチングにも使われる)。表示用のラベルだけ
// ここで言語別に用意し、フィルターピル等の見た目だけを差し替える。
const GENRE_LABELS: Record<Locale, Record<string, string>> = {
  ja: {
    ガールズバー: "ガールズバー",
    キャバクラ: "キャバクラ",
    コンカフェ: "コンカフェ",
    "ラウンジ/クラブ": "ラウンジ/クラブ",
    "スナック/バー": "スナック/バー",
    アフター: "アフター",
  },
  en: {
    ガールズバー: "Girls Bar",
    キャバクラ: "Kyabakura",
    コンカフェ: "Concept Cafe",
    "ラウンジ/クラブ": "Lounge/Club",
    "スナック/バー": "Snack/Bar",
    アフター: "After Hours",
  },
  zh: {
    ガールズバー: "女孩酒吧",
    キャバクラ: "夜总会",
    コンカフェ: "概念咖啡厅",
    "ラウンジ/クラブ": "酒廊/俱乐部",
    "スナック/バー": "小酒馆",
    アフター: "深夜餐饮",
  },
};

export function genreLabel(locale: Locale, genre: string): string {
  return GENRE_LABELS[locale]?.[genre] ?? genre;
}
