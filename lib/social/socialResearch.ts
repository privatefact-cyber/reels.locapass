import { createAdminClient } from "@/lib/supabase/admin";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import { generateAiImage, imageSceneFromPost } from "@/lib/social/socialImages";
import type { Destination } from "@/lib/social/threadsPosts";
import { validateThreadsText } from "@/lib/social/threadsWriter";

const db = () => createAdminClient() as any;
type Candidate = { title: string; summary: string; why_now: string; audience_value: string; score: number; post: string };

/** 現在のWebを検索し、根拠のある話題だけを下書きにする。検索結果の出典もDBへ保存する。 */
export async function createResearchDraft(dest: Destination): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const brand = dest.account === "luxela" ? { name: "LUXELA", url: "https://luxela.jp", audience: "夜のお店を探す20歳以上の人、または夜のお店の運営者", themes: "ナイトワーク、接客、店舗選び、採用、SNS集客、夜の街の新しい動き" } : { name: "LOCAPASS", url: "https://locapass.net", audience: "飲食・美容・観光・地域店舗を探す人、または地域店舗の運営者", themes: "地域のおでかけ、飲食、美容、観光、店舗集客、ショート動画、訪日客、地域の新しい動き" };
  const { data: recent } = await db().from("locapass_threads_posts").select("body").eq("account", dest.account).order("created_at", { ascending: false }).limit(20);
  // 1段目: 検索だけを行い、確認できた事実を文章で集める。「JSONだけ返す」指定と一緒にすると、Geminiは検索の出典を付けないことがあるため、2段階に分ける。
  const searchPrompt = `Google検索を使い、今日の日本のWeb上で注目が伸びそうな話題を調査してください。${brand.name}公式SNSの投稿材料にします。
対象: ${brand.audience}\n領域: ${brand.themes}
5件の話題について、それぞれ「検索で確認できた事実(具体的な数字・固有名詞を含む)」と「なぜ今なのか」「読者の役に立つ点」を書いてください。
除外: 古い一般論、芸能ゴシップ、事故・炎上便乗、政治、未確認情報、競合批判、売り込みだけの内容。`;
  const searchResponse = await geminiGenerateWithFallback(key, { contents: [{ role: "user", parts: [{ text: searchPrompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.7 } }, "social-research-search", 60_000);
  if (!searchResponse) throw new Error("Webリサーチに失敗しました");
  const searchRaw = await searchResponse.json() as any;
  const searchCandidate = searchRaw.candidates?.[0];
  const facts = searchCandidate?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  const sources = (searchCandidate?.groundingMetadata?.groundingChunks ?? []).map((c: any) => ({ url: c.web?.uri, title: c.web?.title })).filter((s: any) => s.url);
  const queries = searchCandidate?.groundingMetadata?.webSearchQueries ?? [];
  if (!sources.length || !facts.trim()) throw new Error("出典を確認できる話題がありませんでした");

  // 2段目: 集めた事実だけを材料に、投稿案をJSONで作る(検索は使わない)。
  const prompt = `次の「検索で確認できた事実」だけを材料に、${brand.name}公式SNSの投稿候補を3件作ってください。事実にないことは書かないでください。
対象: ${brand.audience}\n領域: ${brand.themes}

【検索で確認できた事実】
${facts}

採点(100点): 直近性30、対象との関連25、事実の具体性20、人に教えたくなる実用性15、${brand.name}へ自然につながる度10。
除外: 古い一般論、芸能ゴシップ、事故・炎上便乗、政治、未確認情報、競合批判、売り込みだけの内容。
投稿文は100〜350文字。広告文ではなく、街の発見を伝える編集者の文章にする。冒頭の1〜2行で驚き・発見・共感・ユーモアなど読む理由を作り、事実は上の事実を土台に、表現は大胆に・読み物として面白くする(です・ます調に固定しない)。「魅力を発信」「新しい体験をお届け」のような中身のない広告表現、架空の口コミ・体験談は禁止。数字は積極的に使ってよい。出典URLは本文に入れない。文末に${brand.url}を1つだけ入れ、その次の行に関連するハッシュタグを1〜3個入れる。
直近投稿と同じ話題・言い回しは避ける: ${(recent ?? []).map((r: any) => String(r.body).replace(/\s+/g, " ").slice(0, 70)).join(" / ")}

JSONだけを返す: {"candidates":[{"title":"","summary":"確認できた事実","why_now":"今扱う理由","audience_value":"読者の役立ち方","score":0,"post":"投稿本文"}]}`;
  const response = await geminiGenerateWithFallback(key, { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, responseMimeType: "application/json" } }, "social-research", 60_000);
  if (!response) throw new Error("Webリサーチに失敗しました");
  const raw = await response.json() as any;
  const text = raw.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text.replace(/```json\s*|```/g, "").trim()) as { candidates?: Candidate[] };
  const choices = (parsed.candidates ?? []).filter((c) => c.score >= 65 && !validateThreadsText(c.post, (recent ?? []).map((r: any) => r.body), dest.account)).sort((a, b) => b.score - a.score);
  if (!choices.length) throw new Error("投稿に使える水準の話題が見つかりませんでした");
  const best = choices[0];
  const imageUrl = await generateAiImage(best.title, dest.account, { scene: await imageSceneFromPost(best.post, dest.account) });
  const { data: research, error: researchError } = await db().from("locapass_social_research").insert({ account: dest.account, title: best.title, summary: best.summary, why_now: best.why_now, audience_value: best.audience_value, score: best.score, body: best.post, sources, search_queries: queries }).select("id").single();
  if (researchError || !research) throw new Error(`リサーチ結果を保存できませんでした: ${researchError?.message ?? "0件"}`);
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: `research:${research.id}`, body: best.post, image_url: imageUrl, source: "ai", status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
  if (error || !data) throw new Error(`リサーチ下書きを保存できませんでした: ${error?.message ?? "0件"}`);
  return data.id;
}
