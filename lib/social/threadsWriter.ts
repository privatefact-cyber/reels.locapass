import { geminiGenerateWithFallback } from "@/lib/gemini";
import { THREADS_FACTS } from "@/lib/social/threadsFacts";
import type { ThreadsTopic } from "@/lib/social/threadsTopics";

/** Threadsの文字数の上限は500。余裕をみて、これを超えたら採用しない。 */
export const THREADS_MAX_CHARS = 480;
export const THREADS_MIN_CHARS = 80;
export const THREADS_SITE_URL = "https://locapass.net";

/** 文章に入れてはいけない表現。根拠のない主張・実績の数字・公開状況・金額は、書かせない(事実メモの§5のルール)。 */
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /日本一|日本最大|業界初|No\.?\s?1|ナンバーワン|唯一|圧倒的/i, reason: "最上級・比較の表現" },
  { pattern: /100\s?%|絶対|必ず|確実に|間違いなく|誰でも簡単に/, reason: "断定・効果の保証" },
  { pattern: /ユーザー数|店舗数|導入実績|満足度|導入店|掲載数|\d+\s?(店舗|軒|人|件|万)/, reason: "実績・数字の主張" },
  { pattern: /ベータ|β版|ローンチ|公開済み|全国展開|リリース/, reason: "公開状況への言及" },
  { pattern: /街の声/, reason: "噂レベルの機能への言及" },
  { pattern: /月額|\d+\s?円|無料|割引|キャンペーン/, reason: "金額・料金の言及" },
  { pattern: /@\w|＠/, reason: "メンション" },
  { pattern: /#|＃/, reason: "ハッシュタグ" },
  { pattern: /Instagram(より|と比べ)|TikTok(より|と比べ)|ホットペッパー|食べログ|Googleマップ(より|と比べ)/, reason: "他社との比較" },
];

function bigrams(text: string): Set<string> {
  const s = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 文字のペアの重なり(0〜1)。直近の投稿と似すぎていないかの確認に使う。 */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}

/** 投稿してよい文章か確認する。問題があれば理由を、無ければnullを返す。 */
export function validateThreadsText(text: string, recent: string[]): string | null {
  const t = text.trim();
  if (t.length < THREADS_MIN_CHARS) return `短すぎる(${t.length}文字)`;
  if (t.length > THREADS_MAX_CHARS) return `長すぎる(${t.length}文字)`;
  for (const rule of FORBIDDEN) if (rule.pattern.test(t)) return `使えない表現: ${rule.reason}`;
  const urls = t.match(/https?:\/\/[^\s]+/g) ?? [];
  if (urls.length > 1) return "URLが複数ある";
  if (urls.some((u) => !u.startsWith(THREADS_SITE_URL))) return "LOCAPASS以外のURLがある";
  for (const old of recent) if (similarity(t, old) >= 0.5) return "直近の投稿と似すぎている";
  return null;
}

function buildPrompt(topic: ThreadsTopic, recent: string[]): string {
  const recentList = recent.length ? recent.slice(0, 12).map((r, i) => `${i + 1}. ${r.replace(/\s+/g, " ").slice(0, 60)}…`).join("\n") : "(まだありません)";
  return `あなたは「LOCAPASS【ロカパス】」公式のThreads運営担当です。小さなお店のオーナー・店長に向けて、集客に役立つ短い投稿を1本書いてください。

# 読者
飲食店・美容室・ネイル・エステ・ペット関連・車屋・宿泊など、地域の小さなお店のオーナーや店長。SNSや集客に詳しくはない。

# 今日のテーマ
${topic.title}
切り口: ${topic.angle}

# 文体と構成
- 親しみのある話し言葉。です・ますを基本に、堅くしない。
- 1行目は、読み手が手を止める問いかけ・ひとことで始める。先頭に絵文字を1つ付けてよい。
- 短い行で改行する。要点は「・」の箇条書きで3つまで。
- 最後に、LOCAPASSをさりげなく一言で紹介し、次のURLを1つだけ添える: ${THREADS_SITE_URL}
- 全体で200〜420文字。
- ハッシュタグ・メンション・URL(上記以外)は書かない。

# 絶対に守ること(根拠のない主張をしない)
- 下の「事実メモ」に書かれている機能だけを、LOCAPASSの機能として書く。書かれていないことを、できると書かない。
- ユーザー数・店舗数・実績・売上・満足度などの数字は書かない。
- 「日本一」「No.1」「業界初」など最上級・比較の表現、「必ず」「絶対」など効果の保証は書かない。
- 金額・料金・無料・割引には触れない。
- サービスの公開状況(ベータ・ローンチ・リリースなど)には触れない。
- 他社サービス名を挙げて比較しない。
- 翻訳・字幕は自動で、投稿者が直せる、と書く(完璧とは書かない)。
- 「街の声」には触れない。

# 直近の投稿(同じ言い回し・同じ切り口を避ける)
${recentList}

# 事実メモ(LOCAPASSの機能の根拠)
${THREADS_FACTS}

# 出力
次のJSONだけを返す。説明や前置きは不要。
{"text": "投稿本文"}`;
}

export type WriteResult = { ok: true; text: string } | { ok: false; error: string; lastText: string | null };

/** テーマに沿った投稿文をAI(Gemini)に書かせる。確認(validateThreadsText)に通るまで、最大3回書き直す。 */
export async function writeThreadsPost(topic: ThreadsTopic, recent: string[]): Promise<WriteResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY が未設定です", lastText: null };
  let lastReason = "文章を作れませんでした";
  let lastText: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const feedback = attempt > 0 ? `\n\n# 前回の不採用の理由\n${lastReason}。この点を直して書き直す。` : "";
    const response = await geminiGenerateWithFallback(
      apiKey,
      {
        contents: [{ role: "user", parts: [{ text: buildPrompt(topic, recent) + feedback }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
      },
      "threads-writer",
    );
    if (!response) {
      lastReason = "AIの呼び出しに失敗";
      continue;
    }
    try {
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = JSON.parse(raw.replace(/```json\s*|```/g, "")) as { text?: unknown };
      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (text) lastText = text;
      const problem = validateThreadsText(text, recent);
      if (!problem) return { ok: true, text };
      lastReason = problem;
      console.error(`threads-writer: 不採用(${attempt + 1}回目): ${problem}`);
    } catch {
      lastReason = "AIの返事を読み取れなかった";
    }
  }
  return { ok: false, error: `3回書き直しても基準を満たせませんでした(最後の理由: ${lastReason})`, lastText };
}
