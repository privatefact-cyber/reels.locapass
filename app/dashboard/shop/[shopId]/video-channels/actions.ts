"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveChannel, syncShopChannel, type ChannelRow } from "@/lib/youtube/shopChannels";

/** 1店に登録できるチャンネル数(誤登録や悪用で、YouTubeの枠を使い切らないための安全装置)。 */
const MAX_CHANNELS_PER_SHOP = 5;

/**
 * 呼び出した人が、この店の管理者(または運営者)で、店が「動画の自動追加」を契約しているかを確認する。
 * 契約のオン/オフは運営者だけが変更できる(DBのトリガーで保護)。運営者は契約がなくても操作できる(代行・確認用)。
 */
async function authorize(shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を編集する権限がありません");
  const admin = createAdminClient() as any;
  const { data: shop } = await admin.from("locapass_shops").select("portal_id, auto_video_enabled, status").eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("店舗が見つかりません");
  const { data: isOperator } = shop.portal_id ? await supabase.rpc("locapass_is_portal_admin", { p_portal_id: shop.portal_id }) : { data: false };
  if (!shop.auto_video_enabled && !isOperator) throw new Error("動画の自動追加は、オプションの契約が必要です");
  return { admin, userId: user.id };
}

export type AddChannelResult = { ok: true; title: string | null; imported: number } | { ok: false; error: string };

export async function addShopChannel(shopId: string, rawInput: string): Promise<AddChannelResult> {
  try {
    const { admin, userId } = await authorize(shopId);
    const { count } = await admin.from("locapass_shop_youtube_channels").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
    if ((count ?? 0) >= MAX_CHANNELS_PER_SHOP) return { ok: false, error: `登録できるチャンネルは${MAX_CHANNELS_PER_SHOP}つまでです` };
    const info = await resolveChannel(rawInput);
    if (!info) return { ok: false, error: "チャンネルを見つけられませんでした。「@名前」または「youtube.com/channel/UC…」の形のURLを貼ってください" };
    const { data: row, error } = await admin.from("locapass_shop_youtube_channels").insert({
      shop_id: shopId, channel_id: info.channelId, channel_title: info.title, channel_thumb_url: info.thumbUrl,
      uploads_playlist_id: info.uploadsPlaylistId, created_by: userId,
    }).select("id, shop_id, channel_id, uploads_playlist_id, imported_count, last_checked_at").single();
    if (error) return { ok: false, error: error.code === "23505" ? "このチャンネルはすでに登録されています" : `登録に失敗しました: ${error.message}` };
    // 登録のすぐあとに、最初の取り込みを行う(最新の動画から順に)。
    const result = await syncShopChannel(row as ChannelRow);
    revalidatePath(`/dashboard/shop/${shopId}/video-channels`);
    revalidatePath(`/dashboard/shop/${shopId}/posts`);
    return { ok: true, title: info.title, imported: result.imported };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "登録に失敗しました" };
  }
}

export async function removeShopChannel(shopId: string, channelRowId: string) {
  const { admin } = await authorize(shopId);
  // 取り込み済みの動画(リール)はそのまま残す。台帳も残すので、削除したあとに再登録しても同じ動画は取り込み直さない。
  await admin.from("locapass_shop_youtube_channels").delete().eq("id", channelRowId).eq("shop_id", shopId);
  revalidatePath(`/dashboard/shop/${shopId}/video-channels`);
}

export async function setShopChannelStatus(shopId: string, channelRowId: string, status: "active" | "paused") {
  const { admin } = await authorize(shopId);
  await admin.from("locapass_shop_youtube_channels").update({ status }).eq("id", channelRowId).eq("shop_id", shopId);
  revalidatePath(`/dashboard/shop/${shopId}/video-channels`);
}

/** 「今すぐ確認」。前回の確認から10分以内なら何もしない(連打でAPIの枠を使わないように)。 */
export async function syncShopChannelNow(shopId: string, channelRowId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { admin } = await authorize(shopId);
    const { data: row } = await admin.from("locapass_shop_youtube_channels").select("id, shop_id, channel_id, uploads_playlist_id, imported_count, last_checked_at").eq("id", channelRowId).eq("shop_id", shopId).maybeSingle();
    if (!row) return { ok: false, message: "チャンネルが見つかりません" };
    if (row.last_checked_at && Date.now() - new Date(row.last_checked_at).getTime() < 10 * 60 * 1000) {
      return { ok: false, message: "確認したばかりです。しばらくしてからもう一度お試しください" };
    }
    const result = await syncShopChannel(row as ChannelRow);
    revalidatePath(`/dashboard/shop/${shopId}/video-channels`);
    revalidatePath(`/dashboard/shop/${shopId}/posts`);
    if (result.error) return { ok: false, message: `確認に失敗しました: ${result.error}` };
    return { ok: true, message: result.imported > 0 ? `新しい動画を${result.imported}本、追加しました` : "新しい動画はありませんでした" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "確認に失敗しました" };
  }
}
