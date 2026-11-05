"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { collectYoutubeCandidates, findExistingShop, findOfficialWebsite, publishYoutubeIngestion, saveYoutubeCandidates } from "@/lib/youtube/shopIngestion";

const SHIBUYA_PORTAL_ID = 407;

function refresh() {
  revalidatePath("/admin/youtube-intake");
  revalidatePath("/admin/youtube-stock");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/map");
}

export async function collectShibuyaShorts(formData: FormData) {
  await requireRootAdmin();
  const query = String(formData.get("query") ?? "渋谷 グルメ カフェ").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(formData.get("limit") ?? 50), 1), 50);
  if (!query) throw new Error("検索キーワードを入力してください");
  const candidates = await collectYoutubeCandidates(query, limit);
  await saveYoutubeCandidates(SHIBUYA_PORTAL_ID, candidates);
  refresh();
}

export async function searchExistingShibuyaShop(name: string, address?: string) {
  await requireRootAdmin();
  return findExistingShop(SHIBUYA_PORTAL_ID, name, address);
}

export async function findOfficialSiteForIngestion(ingestionId: string) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("title, candidate_name, candidate_address, match_reason").eq("id", ingestionId).eq("portal_id", SHIBUYA_PORTAL_ID).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "候補が見つかりません");
  const result = await findOfficialWebsite(data.title, data.candidate_name, data.candidate_address);
  const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: result.name,
    candidate_address: result.address,
    official_url: result.officialUrl,
    official_url_verified: false,
    match_reason: result.reason,
  }).eq("id", ingestionId);
  if (updateError) throw new Error(`公式サイト候補の保存に失敗しました: ${updateError.message}`);
  refresh();
}

export async function reviewYoutubeIngestion(ingestionId: string, formData: FormData) {
  const user = await requireRootAdmin();
  const candidateName = String(formData.get("candidate_name") ?? "").trim().slice(0, 120) || null;
  const candidateAddress = String(formData.get("candidate_address") ?? "").trim().slice(0, 300) || null;
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const shopId = String(formData.get("shop_id") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "pending");
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");
  if (!["pending", "matched_existing", "ready_to_create", "rejected"].includes(decision)) throw new Error("不正な判定です");
  if (decision === "matched_existing" && (!shopId || !officialUrl)) throw new Error("既存店舗への紐づけには店舗IDと公式サイトが必要です");
  if (shopId) {
    const { data: shop } = await createAdminClient().from("locapass_shops").select("id").eq("id", shopId).eq("portal_id", SHIBUYA_PORTAL_ID).maybeSingle();
    if (!shop) throw new Error("渋谷ポータルの店舗を選んでください");
  }
  const { error } = await (createAdminClient() as any).from("locapass_youtube_ingestions").update({
    candidate_name: candidateName,
    candidate_address: candidateAddress,
    official_url: officialUrl,
    official_url_verified: Boolean(officialUrl),
    matched_shop_id: shopId,
    match_status: decision,
    match_reason: reason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    error_message: null,
  }).eq("id", ingestionId).eq("portal_id", SHIBUYA_PORTAL_ID);
  if (error) throw new Error(`判定の保存に失敗しました: ${error.message}`);
  refresh();
}

/** 公式HPと住所が確認できた候補だけを、既存の店舗発行RPCでdraft作成する。 */
export async function createDraftShopFromIngestion(ingestionId: string, formData: FormData) {
  await requireRootAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const address = String(formData.get("address") ?? "").trim().slice(0, 300);
  const officialUrl = String(formData.get("official_url") ?? "").trim();
  const category = String(formData.get("category") ?? "カフェ・スイーツ");
  if (!name || !address || !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("店名、住所、httpsの公式サイトを確認してください");

  const client = await createClient();
  const { data: shopId, error } = await (client as any).rpc("locapass_create_shop", {
    p_portal_id: SHIBUYA_PORTAL_ID,
    p_name: name,
    p_category: category,
    p_address: address,
    p_business_type: "food",
  });
  if (error || !shopId) throw new Error(error?.message ?? "店舗の仮登録に失敗しました");
  const admin = createAdminClient();
  const { error: updateError } = await admin.from("locapass_shops").update({ url: officialUrl }).eq("id", shopId);
  if (updateError) throw new Error(`公式サイトの保存に失敗しました: ${updateError.message}`);
  const { error: ingestionError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: name,
    candidate_address: address,
    official_url: officialUrl,
    official_url_verified: true,
    matched_shop_id: shopId,
    match_status: "ready_to_create",
  }).eq("id", ingestionId).eq("portal_id", SHIBUYA_PORTAL_ID);
  if (ingestionError) throw new Error(`候補の更新に失敗しました: ${ingestionError.message}`);
  refresh();
}

export async function publishReviewedYoutubeIngestion(ingestionId: string) {
  const user = await requireRootAdmin();
  await publishYoutubeIngestion(ingestionId, user.id);
  refresh();
}

