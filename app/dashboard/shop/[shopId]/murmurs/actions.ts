"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { containsNgWord } from "@/lib/reels/ngWords";
import { MURMUR_BUCKET, MURMUR_DAILY_LIMIT, MURMUR_MAX_LENGTH } from "@/lib/murmur/config";

/** 呼び出した人が、この店の管理者(店舗管理者・ポータル管理者・システム管理者)かを確認する。 */
async function authorize(shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗に投稿する権限がありません");
  const { data: isSuper } = await supabase.rpc("locapass_is_super_admin");
  return { admin: createAdminClient() as any, userId: user.id, isSuper: !!isSuper };
}

function jstMidnightIso(): string {
  const jstNow = new Date(Date.now() + 9 * 3600_000);
  jstNow.setUTCHours(0, 0, 0, 0);
  return new Date(jstNow.getTime() - 9 * 3600_000).toISOString();
}

export type PrepareUploadResult = { ok: true; path: string; token: string } | { ok: false; error: string };

/** 写真を、ブラウザから直接送るための、短命の署名付きURL(トークン)を発行する。 */
export async function prepareMurmurImageUpload(shopId: string): Promise<PrepareUploadResult> {
  try {
    const { admin } = await authorize(shopId);
    const path = `murmur/${shopId}/${randomUUID()}.jpg`;
    const { data, error } = await admin.storage.from(MURMUR_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: "写真の送信を準備できませんでした" };
    return { ok: true, path, token: data.token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "写真の送信を準備できませんでした" };
  }
}

export type PostResult = { ok: true } | { ok: false; error: string };

export async function postMurmur(shopId: string, rawBody: string, imagePath: string | null): Promise<PostResult> {
  try {
    const { admin, userId } = await authorize(shopId);
    const body = rawBody.replace(/\r\n/g, "\n").trim();
    if (!body) return { ok: false, error: "ひとことを入力してください" };
    if ([...body].length > MURMUR_MAX_LENGTH) return { ok: false, error: `${MURMUR_MAX_LENGTH}文字以内で入力してください` };
    if (containsNgWord(body)) return { ok: false, error: "使えない言葉が含まれています" };

    let imageUrl: string | null = null;
    if (imagePath) {
      if (!new RegExp(`^murmur/${shopId}/[0-9a-f-]{36}\\.jpg$`).test(imagePath)) return { ok: false, error: "写真が正しくありません" };
      imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/${MURMUR_BUCKET}/${imagePath}`;
    }

    const { count } = await admin
      .from("locapass_shop_murmurs")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .gte("created_at", jstMidnightIso());
    if ((count ?? 0) >= MURMUR_DAILY_LIMIT) return { ok: false, error: `1日に投稿できるのは${MURMUR_DAILY_LIMIT}件までです` };

    const { data: dup } = await admin
      .from("locapass_shop_murmurs")
      .select("id")
      .eq("shop_id", shopId)
      .eq("body", body)
      .is("deleted_at", null)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .limit(1);
    if (dup?.length) return { ok: false, error: "同じ内容を、続けて投稿することはできません" };

    const { error } = await admin.from("locapass_shop_murmurs").insert({ shop_id: shopId, body, image_url: imageUrl, author_user_id: userId });
    if (error) return { ok: false, error: `投稿に失敗しました: ${error.message}` };

    await revalidateShop(admin, shopId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "投稿に失敗しました" };
  }
}

/** 削除できるのは、投稿者本人とシステム管理者(リールと同じ)。消した投稿は deleted_at を入れて残す。 */
export async function deleteMurmur(shopId: string, murmurId: string): Promise<PostResult> {
  try {
    const { admin, userId, isSuper } = await authorize(shopId);
    const { data: row } = await admin.from("locapass_shop_murmurs").select("id, author_user_id").eq("id", murmurId).eq("shop_id", shopId).is("deleted_at", null).maybeSingle();
    if (!row) return { ok: false, error: "投稿が見つかりません" };
    if (row.author_user_id !== userId && !isSuper) return { ok: false, error: "削除できるのは、投稿した本人とシステム管理者です" };
    const { data: done, error } = await admin
      .from("locapass_shop_murmurs")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", murmurId)
      .eq("shop_id", shopId)
      .select("id");
    if (error || !done?.length) return { ok: false, error: "削除できませんでした" };
    await revalidateShop(admin, shopId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "削除できませんでした" };
  }
}

async function revalidateShop(admin: any, shopId: string) {
  const { data: shop } = await admin.from("locapass_shops").select("slug, portal:locapass_portals ( slug )").eq("id", shopId).maybeSingle();
  const portal = Array.isArray(shop?.portal) ? shop.portal[0] : shop?.portal;
  revalidatePath(`/dashboard/shop/${shopId}/murmurs`);
  if (shop?.slug && portal?.slug) {
    revalidatePath(`/${portal.slug}/shops/${shop.slug}`);
    revalidatePath(`/${portal.slug}/shops/${shop.slug}/murmurs`);
    revalidatePath(`/${portal.slug}/murmurs`);
  }
}
