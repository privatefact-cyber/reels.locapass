import { randomBytes } from "node:crypto";
import type { JournalBlock } from "@/lib/journal/posts";

/**
 * 記事を書く人が入れなくてよい項目(URL名・公開日・要約)を、保存のときに自動で作る。サーバー専用。
 * 書く人は「写真と記事」だけでよく、SEO向けの要約はAIが記事から作る。
 */

/** 今日の日付(JST)。YYYY-MM-DD */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** URL名を自動で付ける。例: 20261111-a3f9k2 (日付+ランダム6文字。重複しない・手で間違えようがない) */
export function autoSlug(publishedOn: string): string {
  const date = publishedOn.replace(/-/g, "");
  const rand = Array.from(randomBytes(6), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `${date}-${rand}`;
}

/** 本文のブロックから、文字だけを取り出す(要約づくり用)。 */
export function plainTextOf(body: JournalBlock[]): string {
  return body
    .map((b) => (b.type === "p" || b.type === "h2" ? b.text : b.type === "ul" ? b.items.join(" ") : ""))
    .filter(Boolean)
    .join("\n");
}

/** AIが使えないときの要約: 本文の最初の文(長ければ切る)。 */
function fallbackDescription(title: string, text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return title.slice(0, 120);
  const firstSentence = /^[^。!?!?]{10,}[。!?!?]/.exec(flat)?.[0] ?? flat;
  return firstSentence.length > 110 ? `${firstSentence.slice(0, 109)}…` : firstSentence;
}

/**
 * 一覧・検索結果に出る要約(1〜2文)を、記事から作る。
 * AIの失敗・キー未設定のときも、本文の最初の文で必ず埋める(公開を止めない)。
 */
export async function autoDescription(title: string, body: JournalBlock[]): Promise<string> {
  const text = plainTextOf(body);
  const key = process.env.GEMINI_API_KEY;
  if (!key || !text.trim()) return fallbackDescription(title, text);
  const prompt = [
    "次の記事の、検索結果と記事一覧に出す要約文を日本語で書いてください。",
    "",
    `タイトル: ${title}`,
    `本文: ${text.slice(0, 4000)}`,
    "",
    "ルール:",
    "- 1〜2文、100文字前後(最大120文字)。記事の内容がひと目で伝わり、読みたくなる文にする。",
    "- 検索されそうな言葉(店・街・メニュー・サービス名など、記事に出てくるもの)を自然に含める。",
    "- 記事に書かれていないことは書かない。誇張や「絶対」「最高」などの言い切りをしない。",
    "- ハッシュタグ・URL・絵文字・かぎかっこでの引用は入れない。",
    "",
    '出力は次のJSONだけにしてください。{"description":string}',
  ].join("\n");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return fallbackDescription(title, text);
    const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const value = (JSON.parse(raw) as { description?: unknown }).description;
    const out = typeof value === "string" ? value.replace(/https?:\/\/\S+/g, "").replace(/[#＃]\S+/g, "").replace(/\s+/g, " ").trim() : "";
    return out.length >= 10 && out.length <= 300 ? out : fallbackDescription(title, text);
  } catch {
    return fallbackDescription(title, text);
  }
}
