import { createAdminClient } from "@/lib/supabase/admin";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import { generateAiImage } from "@/lib/social/socialImages";
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
  const prompt = `Google検索を使い、今日の日本のWeb上で注目が伸びそうな話題を調査してください。${brand.name}公式SNSの投稿候補を3件作ります。
対象: ${brand.audience}\n領域: ${brand.themes}

採点(100点): 直近性30、対象との関連25、検索で裏付けられる具体性20、人に教えたくなる実用性15、${brand.name}へ自然につながる度10。
除外: 出典なし、古い一般論、芸能ゴシップ、事故・炎上便乗、政治、未確認情報、競合批判、売り込みだけの内容。
投稿文は110〜240文字。具体的な発見から始め、誇張語・ハッシュタグ・出典URLは本文に入れない。最後に${brand.url}を1つだけ入れる。
直近投稿と同じ話題・言い回しは避ける: ${(recent ?? []).map((r: any) => String(r.body).replace(/\s+/g, " ").slice(0, 70)).join(" / ")}

JSONだけを返す: {"candidates":[{"title":"","summary":"検索で確認した事実","why_now":"今扱う理由","audience_value":"読者の役立ち方","score":0,"post":"投稿本文"}]}`;
  const response = await geminiGenerateWithFallback(key, { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.65 } }, "social-research", 60_000);
  if (!response) throw new Error("Webリサーチに失敗しました");
  const raw = await response.json() as any;
  const candidate = raw.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text.replace(/```json\s*|```/g, "").trim()) as { candidates?: Candidate[] };
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).map((c: any) => ({ url: c.web?.uri, title: c.web?.title })).filter((s: any) => s.url);
  const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];
  const choices = (parsed.candidates ?? []).filter((c) => c.score >= 65 && !validateThreadsText(c.post, (recent ?? []).map((r: any) => r.body), dest.account)).sort((a, b) => b.score - a.score);
  if (!sources.length) throw new Error("出典を確認できる話題がありませんでした");
  if (!choices.length) throw new Error("投稿に使える水準の話題が見つかりませんでした");
  const best = choices[0];
  const imageUrl = await generateAiImage(best.title, dest.account);
  const { data: research, error: researchError } = await db().from("locapass_social_research").insert({ account: dest.account, title: best.title, summary: best.summary, why_now: best.why_now, audience_value: best.audience_value, score: best.score, body: best.post, sources, search_queries: queries }).select("id").single();
  if (researchError || !research) throw new Error(`リサーチ結果を保存できませんでした: ${researchError?.message ?? "0件"}`);
  const { data, error } = await db().from("locapass_threads_posts").insert({ topic: `research:${research.id}`, body: best.post, image_url: imageUrl, source: "ai", status: "draft", platform: dest.platform, account: dest.account }).select("id").single();
  if (error || !data) throw new Error(`リサーチ下書きを保存できませんでした: ${error?.message ?? "0件"}`);
  return data.id;
}
