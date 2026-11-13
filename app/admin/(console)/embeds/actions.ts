"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_THUMB_BYTES, createEmbedPostForShop, uploadThumb } from "@/lib/embed-post/createEmbedPost";

/** システム管理者だけが、外部動画(YouTubeショート/TikTok/Instagramリール)を、店舗を選んでリールまたはイベントとして追加する。 */
export async function createEmbedPost(formData: FormData) {
  await requireRootAdmin();
  await createEmbedPostForShop(createAdminClient(), String(formData.get("shop_id") ?? "").trim(), formData);
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}

export async function deleteEmbedPost(kind: "reel" | "event", id: string) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const table = kind === "event" ? "locapass_shop_events" : "locapass_reels";
  // 外部動画の行だけを消す(通常の投稿を誤って消さない)。0件でもエラーにならないので.select()で確認する。
  const { data, error } = await (admin as any).from(table).delete().eq("id", id).not("embed_provider", "is", null).select("id");
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("削除できませんでした(対象が見つかりません)");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}

/** 追加済みの外部動画のサムネイル画像を、後から差し替える。 */
export async function updateEmbedThumb(kind: "reel" | "event", id: string, formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const file = formData.get("thumb");
  if (!(file instanceof File) || file.size === 0) throw new Error("画像を選んでください");
  if (!file.type.startsWith("image/")) throw new Error("サムネイルは画像ファイルを選んでください");
  if (file.size > MAX_THUMB_BYTES) throw new Error("サムネイル画像が大きすぎます(上限3MB)");
  const url = await uploadThumb(admin, await file.arrayBuffer(), file.type);
  if (!url) throw new Error("サムネイルのアップロードに失敗しました");
  // 外部動画の行だけを更新する。0件でもエラーにならないので.select()で確認する。
  const { data, error } =
    kind === "event"
      ? await (admin as any).from("locapass_shop_events").update({ image_url: url }).eq("id", id).not("embed_provider", "is", null).select("id")
      : await (admin as any).from("locapass_reels").update({ poster_url: url }).eq("id", id).not("embed_provider", "is", null).select("id");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("保存できませんでした(対象が見つかりません)");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}

/** 店舗名で検索(上位30件)。運営者の画面の店舗選択用。 */
export async function searchShopsForEmbed(q: string) {
  await requireRootAdmin();
  const term = q.replace(/[%_,()\\]/g, " ").trim();
  let query = (createAdminClient() as any)
    .from("locapass_shops")
    .select("id, name, embed_enabled, portal:locapass_portals ( name )")
    .eq("status", "active")
    .order("name")
    .limit(30);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  return ((data ?? []) as { id: string; name: string; embed_enabled: boolean; portal: { name: string } | { name: string }[] | null }[]).map((s) => {
    const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
    return { id: s.id, name: s.name, sub: portal?.name ?? null, embedEnabled: Boolean(s.embed_enabled) };
  });
}

/** 店舗のキャスト・スタッフ一覧(退会していない人)。運営者の画面の選択用。値は「cast:ID」「staff:ID」。 */
export async function listMembersForEmbed(shopId: string) {
  await requireRootAdmin();
  if (!shopId) return [];
  const db = createAdminClient() as any;
  const [casts, staff] = await Promise.all([
    db.from("locapass_cast_members").select("id, name").eq("shop_id", shopId).is("deleted_at", null).order("name").limit(200),
    db.from("locapass_shop_staff_members").select("id, name").eq("shop_id", shopId).is("deleted_at", null).order("name").limit(200),
  ]);
  return [
    ...((casts.data ?? []) as { id: string; name: string | null }[]).map((c) => ({ id: `cast:${c.id}`, name: `[キャスト] ${c.name || "(名前なし)"}` })),
    ...((staff.data ?? []) as { id: string; name: string | null }[]).map((c) => ({ id: `staff:${c.id}`, name: `[スタッフ] ${c.name || "(名前なし)"}` })),
  ];
}
