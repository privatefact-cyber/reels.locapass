import type { Locale } from "@/lib/i18n/locale";

/**
 * ポータルトップのタイトル・説明文(検索結果に出る文)。
 * 全ポータルで同じ文だと検索エンジンが区別できず、「大洗 観光」「ペット同伴 カフェ」のような検索に出にくい。
 * そのため、ポータルごとに「地域名+何が見つかるか」を書く。
 *
 * 水戸は、WordPress版(demo.modella.jp)を引き続き使うので、検索で「一押し」にしない方針(2026-11-05)。
 * ここに個別の文を作らず、サイト共通のタイトル・説明文のままにする(INDEX_PUSH_DOWN)。
 */

type Meta = { title: string; description: string };

/** 検索で押し出さないポータル。個別のタイトルを作らず、サイトマップの優先度も下げる。 */
export const LOW_PROFILE_PORTAL_SLUGS: readonly string[] = ["mito"];
export function isLowProfilePortal(slug: string | null | undefined): boolean {
  return !!slug && LOW_PROFILE_PORTAL_SLUGS.includes(slug);
}

const CUSTOM: Record<string, Partial<Record<Locale, Meta>>> = {
  oarai: {
    ja: {
      title: "大洗の観光・グルメ・お店をリールで探す",
      description: "茨城県大洗町の観光スポット・海鮮グルメ・カフェ・お土産のお店を、ショート動画(リール)でチェック。行き方・営業時間・最新の営業状況もまとめて確認できます。",
    },
    en: {
      title: "Oarai travel guide: seafood, cafes and shops in short videos",
      description: "Explore Oarai, Ibaraki: sightseeing spots, seafood restaurants, cafes and souvenir shops in short reels, with directions and opening hours.",
    },
  },
  lizand: {
    ja: {
      title: "ペット同伴OKのカフェ・ドッグラン・宿泊を探す|全国ペット施設ポータル",
      description: "愛犬・愛猫と一緒に行けるカフェ・ドッグラン・宿泊施設・ペットサービスを全国から探せるポータル。サイズ制限や屋外席など、同伴の条件がひと目でわかります。",
    },
    en: {
      title: "Pet-friendly cafes, dog runs and stays in Japan",
      description: "Find cafes, dog runs, lodging and pet services across Japan where your dog or cat is welcome, with clear pet policies for each place.",
    },
  },
  yokohama: {
    ja: {
      title: "横浜の地域カフェ・交流スペースをリールで探す",
      description: "横浜市内の地域カフェ・コミュニティスペース・交流の場を、ショート動画(リール)で紹介。気軽に立ち寄れる場所と、いまの雰囲気がわかります。",
    },
    en: {
      title: "Yokohama community cafes and local spaces in short videos",
      description: "Discover community cafes and neighborhood spaces in Yokohama through short reels: where to drop in and what each place feels like.",
    },
  },
  shibuya: {
    ja: {
      title: "渋谷・原宿のお店・カフェ・スポットをリールで探す",
      description: "渋谷・原宿エリアのカフェ・飲食店・ペットと行けるお店・習い事など、街の人気スポットをショート動画(リール)でチェックできます。",
    },
    en: {
      title: "Shibuya & Harajuku: cafes, shops and spots in short videos",
      description: "Browse cafes, restaurants, pet-friendly places and local classes in Shibuya and Harajuku through short reels.",
    },
  },
  hb: {
    ja: {
      title: "美容室・ネイル・サロンをリールで探す|Health & Beauty",
      description: "美容室・ネイル・エステ・ヘルスケアのお店を、ショート動画(リール)で紹介。雰囲気や施術のイメージを見てから選べます。",
    },
    en: {
      title: "Hair salons, nails and beauty salons in short videos | Health & Beauty",
      description: "Find hair salons, nail salons, esthetic and wellness shops through short reels, and see the atmosphere before you visit.",
    },
  },
  motors: {
    ja: {
      title: "中古車・カーショップをリールで探す|MORTORS",
      description: "中古車販売店・整備工場・カーショップの在庫や雰囲気を、ショート動画(リール)で確認できる自動車ポータルです。",
    },
    en: {
      title: "Used cars and car shops in short videos | MORTORS",
      description: "An automotive portal where you can check used car stock and car shops through short reels.",
    },
  },
  caravan: {
    ja: {
      title: "今日のキッチンカー・移動販売の出店場所をさがす|Caravan",
      description: "日替わりで街にやってくる、キッチンカーと移動販売のお店をまとめたポータル。今日どこに出店しているか、地図とスケジュールで確認できます。",
    },
    en: {
      title: "Where are the food trucks today? | Caravan",
      description: "A portal for food trucks and mobile shops that visit different spots each day. Check today's locations on the map and schedule.",
    },
  },
};

/**
 * ポータルトップのタイトル・説明文。null のときは、サイト共通のもの(app/layout.tsx)をそのまま使う
 * (水戸・locapass公式・個別の文がないポータル、または個別の文が無い言語)。
 */
export function portalMeta(slug: string, locale: Locale): Meta | null {
  if (isLowProfilePortal(slug)) return null;
  const c = CUSTOM[slug];
  if (!c) return null;
  // 中国語・アラビア語の個別の文はまだ無いので、英語の文を使う(検索側は hreflang で言語ごとのURLを区別する)。
  return c[locale] ?? (locale === "ja" ? null : (c.en ?? null));
}
