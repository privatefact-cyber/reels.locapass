/**
 * 文章 → 意味ベクトル(768次元)。リールの文章検索で使う。サーバー専用。
 * コンシェルジュAI(wp-inquiry-index)と同じモデル・同じ次元。
 * 保存する側は RETRIEVAL_DOCUMENT、検索の質問文は RETRIEVAL_QUERY と使い分けると精度が上がる。
 */
const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

export async function embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const v = json.embedding?.values;
  if (!Array.isArray(v) || v.length !== EMBED_DIM) throw new Error("embed: 想定外の応答");
  // 次元を絞ったベクトルは長さがそろっていないので、正規化しておく。
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}
