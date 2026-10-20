import { translateFields, type StoredTranslations } from "@/lib/i18n/contentTranslation";

/** 投稿写真の、投稿者が書いた文章(場所名・一言・住所)。翻訳はこの項目名で保存し、表示時に言語ごとに選ぶ。 */
export type PostTextFields = { spot_name: string; comment: string | null; address: string | null };

/**
 * 投稿の文章を英語・中国語・アラビア語に訳す(店舗の紹介文と同じ仕組み)。失敗してもnull(原文のまま表示される)。
 * 場所名・店名などの固有名詞は訳さず、ローマ字や原文の表記のままにする。
 */
export async function translatePostFields(fields: PostTextFields): Promise<StoredTranslations | null> {
  try {
    return await translateFields({ spot_name: fields.spot_name, comment: fields.comment, address: fields.address });
  } catch (e) {
    console.error("photo translation failed", e);
    return null;
  }
}
