"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVideoUrlWithShortLinks } from "@/lib/video-resolve";
import type { BulkEmbedState } from "@/components/admin/BulkEmbedForm";
import { MAX_THUMB_BYTES, createEmbedPostForShop, uploadThumb } from "@/lib/embed-post/createEmbedPost";

/** システム管理者だけが、外部動画(YouTubeショート/TikTok/Instagramリール)を、店舗を選んでリールまたはイベントとして追加する。 */
export async function createEmbedPost(formData: FormData) {
  await requireRootAdmin();
  await createEmbedPostForShop(createAdminClient(), String(formData.get("shop_id") ?? "").trim(), formData);
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}

/** 外部動画のURLを、1つの店舗(とキャスト)に、まとめて追加する(リールのみ・最大30本)。 */
export async function createEmbedPostsBulk(_prev: BulkEmbedState, formData: FormData): Promise<BulkEmbedState> {
  await requireRootAdmin();
  const shopId = String(formData.get("shop_id") ?? "").trim();
  const member = String(formData.get("member") ?? "").trim();
  const lines = [...new Set(String(formData.get("urls") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (!shopId) return { rows: [{ line: "-", ok: false, message: "店舗を選んでください" }] };
  if (lines.length === 0) return { rows: [{ line: "-", ok: false, message: "URLを貼ってください" }] };
  if (lines.length > 30) return { rows: [{ line: "-", ok: false, message: `一度に追加できるのは30本までです(${lines.length}本あります)` }] };

  const admin = createAdminClient();
  const { data: existing } = await (admin as any).from("locapass_reels").select("embed_provider, embed_ref").eq("shop_id", shopId).not("embed_provider", "is", null);
  const seen = new Set(((existing ?? []) as { embed_provider: string; embed_ref: string }[]).map((r) => `${r.embed_provider}:${r.embed_ref}`));

  const rows: { line: string; ok: boolean; message: string }[] = new Array(lines.length);
  const run = async (i: number) => {
    const line = lines[i];
    try {
      const video = await parseVideoUrlWithShortLinks(line);
      if (!video) throw new Error("URLを判別できません");
      const key = `${video.provider}:${video.ref}`;
      if (seen.has(key)) throw new Error("この店舗にはすでに追加済みです");
      seen.add(key);
      const fd = new FormData();
      fd.set("kind", "reel");
      fd.set("video_url", line);
      if (member) fd.set("member", member);
      await createEmbedPostForShop(admin, shopId, fd);
      rows[i] = { line, ok: true, message: "追加しました" };
    } catch (e) {
      rows[i] = { line, ok: false, message: e instanceof Error ? e.message : "追加できませんでした" };
    }
  };
  for (let i = 0; i < lines.length; i += 4) {
    await Promise.all(lines.slice(i, i + 4).map((_, k) => run(i + k)));
  }
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  return { rows };
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

/** 追加済みの外部動画を、あとから別の店舗(・キャスト/スタッフ)に付け替える。キャスト等を選ばなければ店舗のリールになる。 */
export async function moveEmbedPost(kind: "reel" | "event", id: string, formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient() as any;
  const shopId = String(formData.get("shop_id") ?? "").trim();
  if (!shopId) throw new Error("移動先の店舗を選んでください");
  const { data: shop } = await admin.from("locapass_shops").select("id, portal_id").eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("移動先の店舗が見つかりません");

  let data: { id: string }[] | null;
  let error: { message: string } | null;
  if (kind === "event") {
    ({ data, error } = await admin.from("locapass_shop_events").update({ shop_id: shop.id }).eq("id", id).not("embed_provider", "is", null).select("id"));
  } else {
    // キャスト・スタッフは、移動先の店舗の人かを確認する(値は「cast:ID」「staff:ID」)。
    let castId: string | null = null;
    let staffId: string | null = null;
    const member = String(formData.get("member") ?? "").trim();
    if (member) {
      const [type, mid] = member.split(":");
      const table = type === "cast" ? "locapass_cast_members" : type === "staff" ? "locapass_shop_staff_members" : null;
      if (!table || !mid) throw new Error("選んだ人を判別できません");
      const { data: m } = await admin.from(table).select("id").eq("id", mid).eq("shop_id", shop.id).is("deleted_at", null).maybeSingle();
      if (!m) throw new Error("選んだ人が、移動先の店舗に見つかりません");
      if (type === "cast") castId = mid;
      else staffId = mid;
    }
    // 外部動画の行だけを更新する。ポータルも移動先の店舗に合わせる。0件でもエラーにならないので.select()で確認する。
    ({ data, error } = await admin.from("locapass_reels").update({ shop_id: shop.id, portal_id: shop.portal_id, cast_id: castId, posted_by_staff_id: staffId }).eq("id", id).not("embed_provider", "is", null).select("id"));
  }
  if (error) throw new Error(`付け替えに失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("付け替えできませんでした(対象が見つかりません)");
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
