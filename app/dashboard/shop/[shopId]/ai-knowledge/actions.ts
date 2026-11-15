"use server";

import { revalidatePath } from "next/cache";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { uploadThumb, MAX_THUMB_BYTES } from "@/lib/embed-post/createEmbedPost";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiGenerateContentUrl } from "@/lib/gemini";
import { MAX_ITEM_CHARS, MAX_KNOWLEDGE_FILE_BYTES, MAX_TOTAL_ACTIVE_CHARS, readKnowledgeFile } from "@/lib/shop/extractKnowledge";

/**
 * 店舗AIの「AIの知識」を、店舗の管理者(店舗本人・ポータル管理者・サイト管理者)だけが操作する。
 * 書き込みはサービスロールで、必ず自店舗の行に限る(店舗の権限は getShopForManager で確認する)。
 */
async function shopAndDb(shopId: string) {
  const view = await getShopForManager(shopId);
  if (!view) throw new Error("この店舗を操作する権限がありません");
  return { shop: { id: view.shop.id as string, name: view.shop.name as string }, db: createAdminClient() as any };
}

const MAX_ITEMS = 60;
const refresh = (shopId: string) => revalidatePath(`/dashboard/shop/${shopId}/ai-knowledge`);

export type UploadState = { ok: true; id: string } | { ok: false; message: string } | null;

/** ファイルを読み取って、確認待ち(pending)で保存する。有効にするのは店舗が確認してから。 */
export async function uploadKnowledgeFile(shopId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  try {
    const { shop, db } = await shopAndDb(shopId);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "ファイルを選んでください" };
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return { ok: false, message: "ファイルは4MB以内にしてください(写真は自動で小さくします)" };
    const { count } = await db.from("locapass_shop_ai_knowledge").select("id", { count: "exact", head: true }).eq("shop_id", shop.id);
    if ((count ?? 0) >= MAX_ITEMS) return { ok: false, message: `登録できるのは${MAX_ITEMS}件までです。古いものを削除してください` };

    const read = await readKnowledgeFile(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    const { data, error } = await db
      .from("locapass_shop_ai_knowledge")
      .insert({ shop_id: shop.id, kind: "file", title: read.title, source_name: file.name.slice(0, 120), extracted_text: read.text, status: "pending", valid_until: read.validUntil })
      .select("id")
      .single();
    if (error) return { ok: false, message: "保存できませんでした。もう一度お試しください" };
    refresh(shopId);
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "読み取れませんでした" };
  }
}

async function activeCharsExcluding(db: any, shopId: string, excludeId: string): Promise<number> {
  const { data } = await db.from("locapass_shop_ai_knowledge").select("extracted_text").eq("shop_id", shopId).eq("status", "active").neq("id", excludeId);
  return ((data ?? []) as { extracted_text: string }[]).reduce((n, r) => n + r.extracted_text.length, 0);
}

/** 内容を直して保存する。「confirm」のときは、そのまま有効にする(確認待ち → 有効)。 */
export async function saveKnowledgeItem(shopId: string, id: string, formData: FormData) {
  const { shop, db } = await shopAndDb(shopId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 40);
  const text = String(formData.get("text") ?? "").trim().slice(0, MAX_ITEM_CHARS);
  const validRaw = String(formData.get("valid_until") ?? "").trim();
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validRaw) ? validRaw : null;
  const confirm = String(formData.get("confirm") ?? "") === "1";
  if (!title || !text) throw new Error("題名と内容を入力してください");

  const patch: Record<string, unknown> = { title, extracted_text: text, valid_until: validUntil, updated_at: new Date().toISOString() };
  if (confirm) {
    if ((await activeCharsExcluding(db, shop.id, id)) + text.length > MAX_TOTAL_ACTIVE_CHARS) throw new Error("AIが読める量の上限に達しました。使わない資料を無効にするか、削除してください");
    patch.status = "active";
  }
  const { data, error } = await db.from("locapass_shop_ai_knowledge").update(patch).eq("id", id).eq("shop_id", shop.id).select("id");
  if (error) throw new Error("保存に失敗しました");
  if (!data?.length) throw new Error("保存できませんでした(対象が見つかりません)");
  refresh(shopId);
}

/** 有効/無効の切り替え。無効にした知識は、すぐAIの参照から外れる。 */
export async function setKnowledgeActive(shopId: string, id: string, active: boolean) {
  const { shop, db } = await shopAndDb(shopId);
  if (active) {
    const { data: row } = await db.from("locapass_shop_ai_knowledge").select("extracted_text").eq("id", id).eq("shop_id", shop.id).maybeSingle();
    if (!row) throw new Error("対象が見つかりません");
    if ((await activeCharsExcluding(db, shop.id, id)) + (row.extracted_text as string).length > MAX_TOTAL_ACTIVE_CHARS) throw new Error("AIが読める量の上限に達しました。使わない資料を無効にするか、削除してください");
  }
  const { data, error } = await db.from("locapass_shop_ai_knowledge").update({ status: active ? "active" : "inactive", updated_at: new Date().toISOString() }).eq("id", id).eq("shop_id", shop.id).select("id");
  if (error || !data?.length) throw new Error("保存できませんでした");
  refresh(shopId);
}

export async function deleteKnowledge(shopId: string, id: string) {
  const { shop, db } = await shopAndDb(shopId);
  const { data, error } = await db.from("locapass_shop_ai_knowledge").delete().eq("id", id).eq("shop_id", shop.id).select("id");
  if (error || !data?.length) throw new Error("削除できませんでした");
  refresh(shopId);
}

/** テキストのメモを、そのまま有効な知識として追加する。 */
export async function addKnowledgeNote(shopId: string, formData: FormData) {
  const { shop, db } = await shopAndDb(shopId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 40);
  const text = String(formData.get("text") ?? "").trim().slice(0, MAX_ITEM_CHARS);
  if (!title || !text) throw new Error("題名と内容を入力してください");
  const { count } = await db.from("locapass_shop_ai_knowledge").select("id", { count: "exact", head: true }).eq("shop_id", shop.id);
  if ((count ?? 0) >= MAX_ITEMS) throw new Error(`登録できるのは${MAX_ITEMS}件までです`);
  if ((await activeCharsExcluding(db, shop.id, "00000000-0000-0000-0000-000000000000")) + text.length > MAX_TOTAL_ACTIVE_CHARS) throw new Error("AIが読める量の上限に達しました。使わない資料を無効にするか、削除してください");
  const { error } = await db.from("locapass_shop_ai_knowledge").insert({ shop_id: shop.id, kind: "note", title, extracted_text: text, status: "active" });
  if (error) throw new Error("保存に失敗しました");
  refresh(shopId);
}

/** 答えられなかった質問に、一言で答える。その答えは、そのまま次からAIの知識として使われる。 */
export async function answerUnanswered(shopId: string, chatId: string, formData: FormData) {
  const { shop, db } = await shopAndDb(shopId);
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 800);
  if (!answer) throw new Error("答えを入力してください");
  const { data: chat } = await db.from("locapass_shop_ai_chats").select("id, question").eq("id", chatId).eq("shop_id", shop.id).maybeSingle();
  if (!chat) throw new Error("質問が見つかりません");
  const text = `質問: ${chat.question}\n答え: ${answer}`;
  if ((await activeCharsExcluding(db, shop.id, "00000000-0000-0000-0000-000000000000")) + text.length > MAX_TOTAL_ACTIVE_CHARS) throw new Error("AIが読める量の上限に達しました。使わない資料を無効にするか、削除してください");
  const { error } = await db.from("locapass_shop_ai_knowledge").insert({ shop_id: shop.id, kind: "answer", title: String(chat.question).slice(0, 40), extracted_text: text, status: "active" });
  if (error) throw new Error("保存に失敗しました");
  await db.from("locapass_shop_ai_chats").update({ handled: true }).eq("id", chatId).eq("shop_id", shop.id);
  refresh(shopId);
  revalidatePath(`/dashboard/shop/${shopId}/ai-questions`);
}

/** 答えなくてよい質問(関係ない質問など)を、一覧から外す。 */
export async function dismissUnanswered(shopId: string, chatId: string) {
  const { shop, db } = await shopAndDb(shopId);
  await db.from("locapass_shop_ai_chats").update({ handled: true }).eq("id", chatId).eq("shop_id", shop.id);
  refresh(shopId);
}

/** 蓄積した直近の質問をまとめて1回で要約し、店舗ページの改善提案を作る(質問のたびにはAIを呼ばない)。1時間に1回まで。 */
export async function generateSuggestions(shopId: string) {
  const { shop, db } = await shopAndDb(shopId);
  const { data: last } = await db.from("locapass_shop_ai_suggestions").select("created_at").eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at as string).getTime() < 3600_000) throw new Error("改善提案は1時間に1回まで作れます。少し待ってからお試しください");
  const { data: chats } = await db.from("locapass_shop_ai_chats").select("question, answerable").eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(100);
  const list = (chats ?? []) as { question: string; answerable: boolean }[];
  if (list.length < 3) throw new Error("質問が3件以上たまってから作れます");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AIの設定が見つかりません");

  const prompt = [
    "あなたは、お店の店長に助言する担当です。お客様が店舗の案内AIに聞いた質問の一覧です。",
    "「(答えられなかった)」と付いた質問は、AIがお店の登録情報から答えられなかったものです。",
    "質問の傾向を3行以内でまとめ、店舗ページや「AIの知識」に足すと良い情報を、優先度の高い順に最大5つ、具体的に提案してください。",
    "- 質問に書かれていない事実(料金・時間など)を、勝手に作らない。",
    "- やさしい言葉で、短く。見出し記号(#)は使わない。箇条書きは「・」を使う。",
    "",
    list.map((c) => `- ${c.question}${c.answerable ? "" : "(答えられなかった)"}`).join("\n"),
  ].join("\n");
  const res = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error("改善提案を作れませんでした。少し待ってからお試しください");
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const body = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!body) throw new Error("改善提案を作れませんでした");
  await db.from("locapass_shop_ai_suggestions").insert({ shop_id: shop.id, body: body.slice(0, 2000), question_count: list.length });
  revalidatePath(`/dashboard/shop/${shopId}/ai-questions`);
}

/**
 * AIコンシェルジュの「顔」を設定する。次の3つから選ぶ:
 *  - none  : AIのアイコンだけ(顔を使わない)
 *  - staff : 店長などスタッフの写真(店舗のスタッフを1人選ぶ)
 *  - custom: 店舗が設定したキャラクターの画像(アップロード)
 * staff / custom は、「写真に写る本人の承諾を得ています」にチェックが入っているときだけ保存する。
 */
export async function saveAiAvatar(shopId: string, formData: FormData) {
  const { shop, db } = await shopAndDb(shopId);
  const kind = String(formData.get("kind") ?? "none");
  const consent = String(formData.get("consent") ?? "") === "1";
  const patch: Record<string, unknown> = { ai_avatar_kind: "none", ai_avatar_staff_id: null, ai_avatar_consent: false };

  if (kind === "staff") {
    if (!consent) throw new Error("本人の承諾を得ていることを確認(チェック)してください");
    const staffId = String(formData.get("staff_id") ?? "").trim();
    const { data: staff } = await db.from("locapass_shop_staff_members").select("id").eq("id", staffId).eq("shop_id", shop.id).is("deleted_at", null).maybeSingle();
    if (!staff) throw new Error("選んだスタッフが、この店舗に見つかりません");
    Object.assign(patch, { ai_avatar_kind: "staff", ai_avatar_staff_id: staffId, ai_avatar_consent: true });
  } else if (kind === "custom") {
    if (!consent) throw new Error("画像に写る人・著作物について、使ってよいことを確認(チェック)してください");
    const file = formData.get("image");
    let url: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
      if (file.size > MAX_THUMB_BYTES) throw new Error("画像が大きすぎます(上限3MB)");
      url = await uploadThumb(db, await file.arrayBuffer(), file.type);
      if (!url) throw new Error("画像のアップロードに失敗しました");
    } else {
      // 画像を選び直さないときは、いま設定中の画像をそのまま使う
      const { data: cur } = await db.from("locapass_shops").select("ai_avatar_image_url").eq("id", shop.id).maybeSingle();
      url = (cur?.ai_avatar_image_url as string | null) ?? null;
    }
    if (!url) throw new Error("キャラクターの画像を選んでください");
    Object.assign(patch, { ai_avatar_kind: "custom", ai_avatar_image_url: url, ai_avatar_consent: true });
  }
  const { data, error } = await db.from("locapass_shops").update(patch).eq("id", shop.id).select("id");
  if (error || !data?.length) throw new Error("保存できませんでした");
  refresh(shopId);
}
