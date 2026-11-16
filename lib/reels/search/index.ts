/**
 * リール1本分の「検索用データ」を作って保存する(文章検索の材料)。サーバー専用。
 *   search_text = 一言の要約 + キーワード(日本語/英語) + タグ名 + キャプションの先頭
 *   embedding   = search_text の意味ベクトル
 * 書き込みはservice role(検索テーブルは一般には書けない)。呼ぶのは、権限を確認した後のサーバー処理だけ。
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClassifyResult } from "@/lib/reels/tags/classify";
import { TAG_DEFS } from "@/lib/reels/tags/vocabulary";
import { embedText } from "./embed";

const TAG_JA = new Map(TAG_DEFS.map((t) => [t.id, t.labels.ja]));

export function buildSearchText(input: { classified: ClassifyResult; caption: string | null }): string {
  const { classified, caption } = input;
  const parts = [
    classified.summary,
    classified.keywords.length ? `キーワード: ${classified.keywords.join("、")}` : "",
    classified.keywordsEn.length ? `keywords: ${classified.keywordsEn.join(", ")}` : "",
    classified.tags.length ? `タグ: ${classified.tags.map((t) => TAG_JA.get(t) ?? t).join("、")}` : "",
    caption?.trim() ? `キャプション: ${caption.trim().slice(0, 300)}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/** 検索用データを保存(あれば更新)。材料が何もなければ何もしない。 */
export async function saveReelSearch(input: { reelId: string; shopId: string | null; classified: ClassifyResult; caption: string | null }): Promise<boolean> {
  const text = buildSearchText({ classified: input.classified, caption: input.caption });
  if (!text.trim()) return false;
  const embedding = await embedText(text, "RETRIEVAL_DOCUMENT");
  const admin = createAdminClient();
  const { error } = await admin.from("locapass_reel_search" as never).upsert(
    {
      reel_id: input.reelId,
      shop_id: input.shopId,
      search_text: text,
      embedding: `[${embedding.join(",")}]`,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "reel_id" },
  );
  if (error) throw new Error(`検索データの保存に失敗: ${error.message}`);
  return true;
}

/** 検索の質問文を整える: 余計な言葉(「の動画」など)を落として、キーワード候補に分ける。 */
export function queryTerms(q: string): string[] {
  const cleaned = q
    .replace(/[　\s]+/g, " ")
    .replace(/(の)?(動画|ビデオ|リール|写真|画像|投稿|もの|やつ)(を|が)?/g, " ")
    .replace(/(が|を|の|は)?(映って|写って|出て)(いる|る|います)?/g, " ")
    .trim();
  const terms = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
  return [...new Set(terms)].slice(0, 6);
}
