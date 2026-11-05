"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { autoMatchYoutubeCandidates, collectYoutubeCandidates, findExistingShop, findOfficialWebsite, geocodeShopIfMissing, importOfficialProfileIfMissing, publishYoutubeIngestion, saveYoutubeCandidates } from "@/lib/youtube/shopIngestion";
import crypto from "node:crypto";

const DEFAULT_INTAKE_PORTAL_ID = 55;

function refresh() {
  revalidatePath("/admin/youtube-intake");
  revalidatePath("/admin/youtube-stock");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/map");
}

export async function collectShibuyaShorts(formData: FormData) {
  const user = await requireRootAdmin();
  const query = String(formData.get("query") ?? "渋谷 グルメ カフェ").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(formData.get("limit") ?? 50), 1), 50);
  const portalId = Number(formData.get("portal_id") ?? DEFAULT_INTAKE_PORTAL_ID);
  if (!query) throw new Error("検索キーワードを入力してください");
  const { data: portal } = await createAdminClient().from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  const candidates = await collectYoutubeCandidates(query, limit);
  await saveYoutubeCandidates(portalId, candidates);
  // 自動照合は1回の収集で最大5件に限定し、YouTube検索自体がタイムアウトしないようにする。
  await autoMatchYoutubeCandidates(portalId, candidates.slice(0, 5), user.id);
  refresh();
}

function extractYoutubeId(rawUrl: string) {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("YouTubeの共有URLを入力してください"); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    id = parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("YouTube動画の共有URLを確認してください");
  return id;
}

export async function addYoutubeUrl(formData: FormData) {
  await requireRootAdmin();
  const rawUrl = String(formData.get("youtube_url") ?? "").trim();
  const youtubeId = extractYoutubeId(rawUrl);
  const portalId = Number(formData.get("portal_id") ?? DEFAULT_INTAKE_PORTAL_ID);
  const admin = createAdminClient();
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");

  const canonicalUrl = `https://www.youtube.com/shorts/${youtubeId}`;
  let title = "YouTube動画";
  let channelTitle: string | null = null;
  let thumbnailUrl: string | null = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`, { next: { revalidate: 3600 } });
    if (response.ok) {
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title?.trim() || title;
      channelTitle = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || thumbnailUrl;
    }
  } catch { /* メタデータ取得に失敗してもURLはストックする */ }

  const { error } = await (admin as any).from("locapass_youtube_ingestions").upsert({
    portal_id: portalId,
    youtube_id: youtubeId,
    source_provider: "youtube",
    source_id: youtubeId,
    video_url: canonicalUrl,
    title,
    description: null,
    channel_title: channelTitle,
    thumbnail_url: thumbnailUrl,
    source_query: "manual:youtube-url",
    embeddable: true,
    match_status: "pending",
  }, { onConflict: "portal_id,youtube_id", ignoreDuplicates: true });
  if (error) throw new Error(`YouTube動画の保存に失敗しました: ${error.message}`);
  refresh();
}

export async function autoProcessPendingYoutube(formData: FormData) {
  const user = await requireRootAdmin();
  const rawPortalId = String(formData.get("portal_id") ?? "").trim();
  const portalId = rawPortalId ? Number(rawPortalId) : null;
  if (portalId !== null && (!Number.isInteger(portalId) || portalId <= 0)) throw new Error("ポータルを確認してください");
  const admin = createAdminClient();
  let query = (admin as any).from("locapass_youtube_ingestions")
    .select("id, portal_id, title, candidate_name, candidate_address")
    .eq("source_provider", "youtube")
    .eq("match_status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (portalId) query = query.eq("portal_id", portalId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`保留候補の取得に失敗しました: ${error.message}`);
  for (const row of (rows ?? []) as { id: string; portal_id: number; title: string; candidate_name: string | null; candidate_address: string | null }[]) {
    try {
      const result = await findOfficialWebsite(row.title, row.candidate_name, row.candidate_address);
      if (!result.name || !result.address || !result.officialUrl) {
        await (admin as any).from("locapass_youtube_ingestions").update({ candidate_name: result.name, candidate_address: result.address, match_reason: result.reason, error_message: "公式サイト・住所を確認できないため保留" }).eq("id", row.id);
        continue;
      }
      const existing = await findExistingShop(row.portal_id, result.name, result.address);
      if (existing.length === 1) {
        await (admin as any).from("locapass_youtube_ingestions").update({
          candidate_name: result.name, candidate_address: result.address, official_url: result.officialUrl,
          official_url_verified: true, matched_shop_id: existing[0].id, match_status: "matched_existing",
          match_reason: "Geminiで公式サイト・住所を確認し、既存店舗に一意一致", reviewed_at: new Date().toISOString(), reviewed_by: user.id, error_message: null,
        }).eq("id", row.id);
        await publishYoutubeIngestion(row.id, user.id);
        continue;
      }
      const draft = new FormData();
      draft.set("portal_id", String(DEFAULT_INTAKE_PORTAL_ID));
      draft.set("name", result.name);
      draft.set("address", result.address);
      draft.set("official_url", result.officialUrl);
      draft.set("category", "カフェ・スイーツ");
      await createDraftShopFromIngestion(row.id, draft);
      await (admin as any).from("locapass_youtube_ingestions").update({ portal_id: DEFAULT_INTAKE_PORTAL_ID }).eq("id", row.id);
      await publishYoutubeIngestion(row.id, user.id);
    } catch (processError) {
      await (admin as any).from("locapass_youtube_ingestions").update({ error_message: processError instanceof Error ? processError.message.slice(0, 500) : "自動処理に失敗しました" }).eq("id", row.id);
    }
  }
  refresh();
}

export async function addTikTokUrl(formData: FormData) {
  await requireRootAdmin();
  const rawUrl = String(formData.get("tiktok_url") ?? "").trim();
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("TikTok URLを入力してください"); }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) throw new Error("TikTokのURLを入力してください");
  const canonicalUrl = rawUrl.split("?")[0];
  const sourceId = canonicalUrl.match(/video\/(\d+)/)?.[1] ?? crypto.createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
  let title = "TikTok動画";
  let description: string | null = null;
  let channelTitle: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, { next: { revalidate: 3600 } });
    if (response.ok) {
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title?.trim() || title;
      channelTitle = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || null;
      description = title;
    }
  } catch { /* URLはストックし、メタデータ取得は後で再試行できる */ }
  const { error } = await (createAdminClient() as any).from("locapass_youtube_ingestions").upsert({
    portal_id: DEFAULT_INTAKE_PORTAL_ID,
    youtube_id: null,
    source_provider: "tiktok",
    source_id: sourceId,
    video_url: canonicalUrl,
    title,
    description,
    channel_title: channelTitle,
    thumbnail_url: thumbnailUrl,
    source_query: "manual:tiktok",
    match_status: "pending",
  }, { onConflict: "portal_id,source_provider,source_id", ignoreDuplicates: true });
  if (error) throw new Error(`TikTok動画の保存に失敗しました: ${error.message}`);
  refresh();
}

export async function searchExistingShibuyaShop(name: string, address?: string) {
  await requireRootAdmin();
  return findExistingShop(DEFAULT_INTAKE_PORTAL_ID, name, address);
}

export async function findOfficialSiteForIngestion(ingestionId: string) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("title, candidate_name, candidate_address, match_reason").eq("id", ingestionId).maybeSingle();
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
  const admin = createAdminClient();
  const { data: currentIngestion, error: currentIngestionError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("portal_id")
    .eq("id", ingestionId)
    .maybeSingle();
  if (currentIngestionError || !currentIngestion) throw new Error(currentIngestionError?.message ?? "候補が見つかりません");
  const candidateName = String(formData.get("candidate_name") ?? "").trim().slice(0, 120) || null;
  const candidateAddress = String(formData.get("candidate_address") ?? "").trim().slice(0, 300) || null;
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const shopId = String(formData.get("shop_id") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "pending");
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  const portalId = Number(formData.get("portal_id") ?? currentIngestion.portal_id ?? DEFAULT_INTAKE_PORTAL_ID);
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");
  if (!["pending", "matched_existing", "ready_to_create", "rejected"].includes(decision)) throw new Error("不正な判定です");
  if (decision === "matched_existing" && (!shopId || !officialUrl)) throw new Error("既存店舗への紐づけには店舗IDと公式サイトが必要です");
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  if (shopId) {
    const { data: shop } = await admin.from("locapass_shops").select("id").eq("id", shopId).eq("portal_id", portalId).maybeSingle();
    if (!shop) throw new Error("選択したポータルの店舗IDを入力してください");
  }
  const { error } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: candidateName,
    candidate_address: candidateAddress,
    official_url: officialUrl,
    official_url_verified: Boolean(officialUrl),
    matched_shop_id: shopId,
    match_status: decision,
    match_reason: reason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    portal_id: portalId,
    error_message: null,
  }).eq("id", ingestionId);
  if (error) throw new Error(`判定の保存に失敗しました: ${error.message}`);
  refresh();
}

/** 公式HPと住所が確認できた候補だけを、既存の店舗発行RPCでdraft作成する。 */
export async function createDraftShopFromIngestion(ingestionId: string, formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data: currentIngestion, error: currentIngestionError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("portal_id")
    .eq("id", ingestionId)
    .maybeSingle();
  if (currentIngestionError || !currentIngestion) throw new Error(currentIngestionError?.message ?? "候補が見つかりません");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const address = String(formData.get("address") ?? "").trim().slice(0, 300);
  const officialUrl = String(formData.get("official_url") ?? "").trim();
  const category = String(formData.get("category") ?? "カフェ・スイーツ");
  if (!name || !address || !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("店名、住所、httpsの公式サイトを確認してください");

  const portalId = Number(formData.get("portal_id") ?? currentIngestion.portal_id ?? DEFAULT_INTAKE_PORTAL_ID);
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  const client = await createClient();
  const { data: shopId, error } = await (client as any).rpc("locapass_create_shop", {
    p_portal_id: portalId,
    p_name: name,
    p_category: category,
    p_address: address,
    p_business_type: "food",
  });
  if (error || !shopId) throw new Error(error?.message ?? "店舗の仮登録に失敗しました");
  const { error: updateError } = await admin.from("locapass_shops").update({ url: officialUrl }).eq("id", shopId);
  if (updateError) throw new Error(`公式サイトの保存に失敗しました: ${updateError.message}`);
  // 新規発行直後に、空欄の店舗詳細を公式サイトから補完する。取込失敗は店舗発行を止めず、管理者が後で確認できるよう候補側に記録する。
  await geocodeShopIfMissing(shopId);
  const imported = await importOfficialProfileIfMissing(shopId, officialUrl);
  const { error: ingestionError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: name,
    candidate_address: address,
    official_url: officialUrl,
    official_url_verified: true,
    matched_shop_id: shopId,
    portal_id: portalId,
    match_status: "ready_to_create",
    error_message: imported.error ? `公式情報の自動取込: ${imported.error}` : null,
  }).eq("id", ingestionId);
  if (ingestionError) throw new Error(`候補の更新に失敗しました: ${ingestionError.message}`);
  refresh();
}

export async function publishReviewedYoutubeIngestion(ingestionId: string) {
  const user = await requireRootAdmin();
  await publishYoutubeIngestion(ingestionId, user.id);
  refresh();
}

