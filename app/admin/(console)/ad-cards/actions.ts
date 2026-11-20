"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { translateFields } from "@/lib/i18n/contentTranslation";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type Parsed = {
  title: string;
  label: string;
  headline: string;
  body: string | null;
  cta: string;
  link_url: string;
  placement: "mid" | "bottom" | "both";
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

/** 日本時間の日付(yyyy-mm-dd)から、その日の始め/終わり(JST)のISO文字列を作る。空なら null。 */
function jstDate(value: FormDataEntryValue | null, endOfDay: boolean): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}+09:00`);
  if (Number.isNaN(d.getTime())) throw new Error("日付の形式が正しくありません");
  return d.toISOString();
}

function parse(formData: FormData): Parsed {
  const title = String(formData.get("title") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || "PR";
  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const cta = String(formData.get("cta") ?? "").trim() || "詳しく見る";
  const link_url = String(formData.get("linkUrl") ?? "").trim();
  const placement = String(formData.get("placement") ?? "mid");
  const sort_order = Number(formData.get("sortOrder") ?? 0);
  if (!title) throw new Error("管理用の名前を入力してください");
  if (!headline) throw new Error("見出しを入力してください");
  if (!/^(\/|https:\/\/)/.test(link_url) || link_url.startsWith("//")) {
    throw new Error("リンク先は、/ から始まるサイト内のパスか、https:// から始まるURLにしてください");
  }
  if (placement !== "mid" && placement !== "bottom" && placement !== "both") throw new Error("表示する場所が正しくありません");
  const starts_at = jstDate(formData.get("startsAt"), false);
  const ends_at = jstDate(formData.get("endsAt"), true);
  if (starts_at && ends_at && starts_at > ends_at) throw new Error("終了日は開始日より後にしてください");
  return {
    title,
    label,
    headline,
    body,
    cta,
    link_url,
    placement,
    sort_order: Number.isFinite(sort_order) ? Math.round(sort_order) : 0,
    starts_at,
    ends_at,
  };
}

async function uploadImage(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("画像が大きすぎます(上限4MB)");
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `cards/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("locapass-ads").upload(path, file, { contentType: file.type });
  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  return supabase.storage.from("locapass-ads").getPublicUrl(path).data.publicUrl;
}

/** 日本語の原文から、英語・中国語・アラビア語を自動で作る。失敗したら翻訳なし(日本語のまま表示)で保存する。 */
async function translate(p: Pick<Parsed, "label" | "headline" | "body" | "cta">) {
  try {
    return await translateFields({ label: p.label, headline: p.headline, body: p.body, cta: p.cta }, "ja");
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath("/admin/ad-cards");
  revalidatePath("/", "layout");
}

export async function createAdCard(formData: FormData) {
  await requireRootAdmin();
  const p = parse(formData);
  const image_url = await uploadImage(formData.get("image"));
  const translations = await translate(p);
  const supabase = await createClient();
  const { error } = await (supabase as any).from("locapass_ad_cards").insert({ ...p, image_url, translations, is_active: true });
  if (error) throw new Error(`登録に失敗しました: ${error.message}`);
  refresh();
}

export async function updateAdCard(id: string, formData: FormData) {
  await requireRootAdmin();
  const p = parse(formData);
  const newImage = await uploadImage(formData.get("image"));
  const removeImage = formData.get("removeImage") === "on";
  const translations = await translate(p);
  const supabase = await createClient();
  const patch: Record<string, unknown> = { ...p, translations, updated_at: new Date().toISOString() };
  if (newImage) patch.image_url = newImage;
  else if (removeImage) patch.image_url = null;
  const { error } = await (supabase as any).from("locapass_ad_cards").update(patch).eq("id", id);
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  refresh();
}

export async function setAdCardActive(id: string, isActive: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from("locapass_ad_cards")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteAdCard(id: string) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await (supabase as any).from("locapass_ad_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
